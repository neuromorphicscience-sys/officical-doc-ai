import { describe, expect, it } from 'vitest'
import { detectDate, detectExplicitHeadingLevel } from '../src/lib/rules/heuristics'
import { typographyForRole, OFFICIAL_STANDARD } from '../src/lib/rules/officialRules'
import { normalizeSemanticText, sha256 } from '../src/lib/hash'

describe('local structure rules', () => {
  it.each([
    ['一、总体要求', 1],
    ['（二）完善机制', 2],
    ['3.具体安排', 3],
    ['（4）材料清单', 4],
    ['普通正文。', undefined],
  ] as const)('maps explicit numbering in %s to heading level %s', (text, expected) => {
    expect(detectExplicitHeadingLevel(text)).toBe(expected)
  })

  it.each([
    ['2026年9月30日', '2026年9月30日'],
    ['2026-9-30', '2026-9-30'],
    ['工作于2026/09/30完成', '2026/09/30'],
    ['没有日期', undefined],
  ] as const)('finds full-width or Arabic date text in %s', (text, expected) => {
    expect(detectDate(text)).toBe(expected)
  })
})

describe('deterministic typography mapping', () => {
  it('maps each document role to the prescribed fonts and sizes', () => {
    expect(typographyForRole('title')).toMatchObject({ eastAsiaFont: '方正小标宋_GBK', sizePt: 22, bold: false })
    expect(typographyForRole('body')).toMatchObject({ eastAsiaFont: '仿宋_GB2312', sizePt: 16 })
    expect(typographyForRole('heading', 1)).toMatchObject({ eastAsiaFont: '黑体', sizePt: 16 })
    expect(typographyForRole('heading', 2)).toMatchObject({ eastAsiaFont: '楷体_GB2312', sizePt: 16 })
    expect(typographyForRole('heading', 3)).toMatchObject({ eastAsiaFont: '仿宋_GB2312', sizePt: 16 })
    expect(typographyForRole('heading', 4)).toMatchObject({ eastAsiaFont: '仿宋_GB2312', sizePt: 16 })
    expect(typographyForRole('unknown')).toBeUndefined()
    expect(OFFICIAL_STANDARD.page).toMatchObject({ widthMm: 210, heightMm: 297, marginTopMm: 37, marginBottomMm: 35, marginLeftMm: 27, marginRightMm: 27, lineSpacingPt: 28.8 })
  })
})

describe('semantic content integrity helpers', () => {
  it('normalizes line endings and hashes exact normalized text', async () => {
    expect(normalizeSemanticText('正文\r\n内容\r\n')).toBe('正文\n内容\n')
    expect(await sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
