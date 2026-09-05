/**
 * The count behind "polling now".
 *
 * Time is passed in rather than mocked, so these assert the window arithmetic itself instead
 * of a clock.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pollsInWindow, recordPoll, resetPollWindows } from "../server/pollWindow.ts";

describe("poll window", () => {
  beforeEach(() => resetPollWindows());

  it("counts requests rather than callers, which is the whole promise", () => {
    // The same tab polling three times is three. Nothing here claims to know how many
    // people are in the room, and the board says so where it draws the number.
    const t = 1_000_000;
    recordPoll("e1", t);
    recordPoll("e1", t + 1000);
    assert.equal(recordPoll("e1", t + 2000), 3);
  });

  it("forgets a poll once it leaves the window", () => {
    const t = 1_000_000;
    recordPoll("e1", t);
    assert.equal(recordPoll("e1", t + 30_000), 2);
    // The first is now 61s old; only the second and this one survive.
    assert.equal(recordPoll("e1", t + 61_000), 2);
  });

  it("keeps engagements apart", () => {
    const t = 1_000_000;
    recordPoll("e1", t);
    recordPoll("e1", t);
    assert.equal(recordPoll("e2", t), 1);
    assert.equal(pollsInWindow("e1", t), 2);
  });

  it("reads as zero for an engagement nobody has polled", () => {
    assert.equal(pollsInWindow("never-seen", 1_000_000), 0);
  });

  it("stops holding an engagement whose window has emptied", () => {
    // Otherwise an instance that has served a thousand engagements holds a thousand empty
    // arrays for as long as it lives.
    const t = 1_000_000;
    recordPoll("e1", t);
    assert.equal(pollsInWindow("e1", t + 61_000), 0);
    assert.equal(recordPoll("e1", t + 61_000), 1);
  });
});
