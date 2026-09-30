# AI 接口契约

## POST `/v1/structure`

前端只发送段落文本和少量原始格式弱特征。

```json
{
  "documentTypeHint": "auto",
  "paragraphs": [
    {
      "id": 0,
      "text": "关于做好有关工作的通知",
      "features": {
        "styleId": "Normal",
        "alignment": "left",
        "fontSizePt": 12,
        "eastAsiaFont": "宋体",
        "boldRatio": 0,
        "inTable": false
      }
    }
  ]
}
```

重要约束：`features` 只作为弱证据。系统 prompt 明确告诉模型，原始 Word 可能从头到尾完全同格式。

## 返回

```json
{
  "documentType": "通知",
  "confidence": 0.96,
  "blocks": [
    { "id": 0, "role": "title", "confidence": 0.99 },
    { "id": 1, "role": "recipient", "confidence": 0.95 },
    { "id": 2, "role": "body", "confidence": 0.99 },
    { "id": 3, "role": "heading", "level": 1, "confidence": 0.93 }
  ],
  "suggestions": [
    {
      "paragraphId": 3,
      "type": "missing_heading_number",
      "proposedText": "一、总体要求",
      "reason": "语义上为一级标题且原文缺少层次序号"
    }
  ],
  "warnings": [],
  "requestId": "...",
  "model": "deepseek-chat"
}
```

## 角色定义

- `title`：主标题
- `recipient`：主送机关
- `body`：正文普通段落
- `heading`：正文层级标题，必须带 `level=1..4`
- `attachment_note`：正文末尾的附件说明
- `attachment_marker`：另页附件开头的“附件”及顺序号
- `attachment_title`：附件标题
- `issuer`：发文单位署名
- `date`：成文日期
- `annotation`：附注
- `unknown`：模型无法可靠判断，需要人工检查

## 内容修改边界

`suggestions` 永远不会自动写回 DOCX。它只用于 UI 展示。自动格式化只根据 `blocks` 修改 OOXML 格式属性。
