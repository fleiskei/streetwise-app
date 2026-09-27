import { describe, expect, it } from "vitest";
import { applyAnswer, isDue, isMastered, replay, type Answer } from "./index";

const DAY = 86_400_000;

describe("leitner", () => {
  it("moves up by mode gain and schedules by box", () => {
    let p = applyAnswer(undefined, { mode: "choice", correct: true, at: 0 });
    expect(p.box).toBe(0.5);
    expect(p.dueAt).toBe(0);
    p = applyAnswer(p, { mode: "choice", correct: true, at: 0 });
    expect(p.box).toBe(1);
    expect(p.dueAt).toBe(DAY);
    p = applyAnswer(p, { mode: "complete", correct: true, at: 10 });
    expect(p.box).toBe(3);
    expect(p.dueAt).toBe(10 + 7 * DAY);
    expect(isMastered(p)).toBe(true);
  });

  it("caps at the last box and drops to box 1 when wrong", () => {
    let p = applyAnswer(undefined, { mode: "complete", correct: true, at: 0 });
    for (let i = 0; i < 5; i++) p = applyAnswer(p, { mode: "complete", correct: true, at: 0 });
    expect(p.box).toBe(5);
    p = applyAnswer(p, { mode: "locate", correct: false, at: 5 });
    expect(p).toMatchObject({ box: 1, dueAt: 5, nWrong: 1, nCorrect: 6 });
    expect(isDue(p, 5)).toBe(true);
  });

  it("replay is order independent of input order", () => {
    const answers: Answer[] = [
      { streetId: "a", mode: "locate", correct: false, at: 3 },
      { streetId: "a", mode: "locate", correct: true, at: 1 },
      { streetId: "a", mode: "locate", correct: true, at: 2 },
    ];
    expect(replay(answers)).toEqual(replay([...answers].reverse()));
    expect(replay(answers).a!.box).toBe(1);
  });
});
