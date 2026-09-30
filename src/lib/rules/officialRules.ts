export const OFFICIAL_STANDARD = {
  page: {
    widthMm: 210,
    heightMm: 297,
    marginTopMm: 37,
    marginBottomMm: 35,
    marginLeftMm: 27,
    marginRightMm: 27,
    linesPerPage: 22,
    lineSpacingPt: 28.8,
  },
  title: {
    eastAsiaFont: '方正小标宋_GBK',
    latinFont: 'Times New Roman',
    sizePt: 22,
    bold: false,
    alignment: 'center',
  },
  body: {
    eastAsiaFont: '仿宋_GB2312',
    latinFont: 'Times New Roman',
    sizePt: 16,
    alignment: 'both',
    firstLineChars: 2,
  },
  heading1: {
    eastAsiaFont: '黑体',
    latinFont: 'Times New Roman',
    sizePt: 16,
    bold: false,
  },
  heading2: {
    eastAsiaFont: '楷体_GB2312',
    latinFont: 'Times New Roman',
    sizePt: 16,
    bold: false,
  },
  heading3: {
    eastAsiaFont: '仿宋_GB2312',
    latinFont: 'Times New Roman',
    sizePt: 16,
    bold: false,
  },
  heading4: {
    eastAsiaFont: '仿宋_GB2312',
    latinFont: 'Times New Roman',
    sizePt: 16,
    bold: false,
  },
  pageNumber: {
    eastAsiaFont: '宋体',
    latinFont: 'Times New Roman',
    sizePt: 14,
  },
} as const

export const SUPPORTED_DOCUMENT_TYPES = [
  'auto',
  '通知',
  '请示',
  '报告',
  '函',
  '会议纪要',
  '工作总结',
  '规章制度',
  '其他',
] as const
