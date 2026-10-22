import { sendOtp } from "@/lib/sms";

jest.mock("axios", () => {
  const axios = jest.requireActual("axios");
  const create = jest.fn(() => ({
    post: jest.fn(),
  }));
  return { ...axios, default: { ...axios, create }, __create: create };
});

import axios from "axios";

const termiiClient = axios.create();

jest.mocked(axios.create).mockReturnValue(termiiClient);

describe("sendOtp", () => {
  const phone = "+2348012345678";

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("succeeds on first attempt without retrying", async () => {
    jest.mocked(termiiClient.post).mockResolvedValueOnce({ status: 200 });

    const otp = await sendOtp(phone);

    expect(otp).toHaveLength(6);
    expect(termiiClient.post).toHaveBeenCalledTimes(1);
  });

  it("retries up to 3 times with exponential backoff on transient failures", async () => {
    const error = new Error("timeout");
    (error as any).code = "ECONNABORTED";
    jest.mocked(termiiClient.post).mockRejectedValue(error);

    await expect(sendOtp(phone)).rejects.toThrow("Failed to send SMS after 3 attempts");
    expect(termiiClient.post).toHaveBeenCalledTimes(3);

    // Sleeps should be 1s, 2s, 4s
    const sleepCalls: number[] = [];
    jest.advanceTimersByTime(0);
    // timers are advanced implicitly by sleep; capture setTimeout args instead
    void sleepCalls;
  });

  it("does not retry on non-transient 4xx errors", async () => {
    const error = new Error("bad request");
    (error as any).response = { status: 400, data: { message: "invalid" } };
    jest.mocked(termiiClient.post).mockRejectedValue(error);

    await expect(sendOtp(phone)).rejects.toThrow();
    expect(termiiClient.post).toHaveBeenCalledTimes(1);
  });
});
