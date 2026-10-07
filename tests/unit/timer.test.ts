import { expect, test } from 'vitest'
import { remainingSeconds, type TimerJob } from '../../src/context/Timer'

test('deadline timers survive elapsed time, stay paused, and never display an extra second on start or resume', () => {
  const job: TimerJob = { id: 'rest', label: 'Διάλειμμα', duration: 60, remaining: 60, deadline: 61000 }
  expect(remainingSeconds(job, 750)).toBe(60)
  expect(remainingSeconds(job, 2250)).toBe(59)
  expect(remainingSeconds(job, 61100)).toBe(0)
  expect(remainingSeconds({ ...job, remaining: 20, deadline: null }, 90000)).toBe(20)
  expect(remainingSeconds({ ...job, remaining: 20, deadline: 121000 }, 100750)).toBe(20)
})
