import { describe, expect, test } from 'vitest'
import { fitBars, formatTime, timeToX } from '../src'

describe('formatTime', () => {
  test('m:ss under an hour, h:mm:ss from an hour, rounding down', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(65.9)).toBe('1:05')
    expect(formatTime(3725)).toBe('1:02:05')
  })
  test('negative values read as 0:00', () => {
    expect(formatTime(-3)).toBe('0:00')
  })
})

describe('timeToX', () => {
  test('maps the visible range onto the width', () => {
    expect(timeToX({ start: 0, end: 10, width: 300 }, 5)).toBe(150)
    expect(timeToX({ start: 10, end: 20, width: 300 }, 15)).toBe(150)
  })
  test('is 0 until the range is known', () => {
    expect(timeToX({ start: 0, end: 0, width: 300 }, 5)).toBe(0)
  })
})

describe('fitBars', () => {
  test('fits exactly `bars` bars into the width, keeping the gap share', () => {
    const { barWidth, barGap } = fitBars(517, 50, 2, 1)
    expect(50 * barWidth + 49 * barGap).toBeCloseTo(517)
    expect(barGap / (barWidth + barGap)).toBeCloseTo(1 / 3)
  })
  test('leaves sizes alone without a bar count', () => {
    expect(fitBars(517, 0, 2, 1)).toEqual({ barWidth: 2, barGap: 1 })
  })
})
