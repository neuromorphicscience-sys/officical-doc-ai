import { useRef, useState } from 'react'

interface Props {
  file?: File
  onFile: (file: File) => void
  onRemove: () => void
  disabled?: boolean
  onInvalidFile?: (message: string) => void
}

export default function Dropzone({ file, onFile, onRemove, disabled, onInvalidFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const accept = (candidate?: File) => {
    if (!candidate) return
    if (!candidate.name.toLowerCase().endsWith('.docx')) { onInvalidFile?.('文件格式不受支持：仅支持 .docx，请先在 Word 中另存为 DOCX。'); return }
    if (!candidate.size) { onInvalidFile?.('文件为空，请重新选择包含正文的 DOCX 文档。'); return }
    if (candidate.size > 50 * 1024 * 1024) { onInvalidFile?.('文件超过 50 MB，请拆分文档或压缩图片后重试。'); return }
    onFile(candidate)
  }
  return <div className="upload-control">
    <button type="button"
      className={`dropzone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); if (!disabled) accept(e.dataTransfer.files?.[0]) }}
      onClick={() => inputRef.current?.click()} disabled={disabled}
      aria-label={file ? `更换文件：${file.name}` : '选择或拖入 DOCX 文件'}>
      <span className="drop-icon" aria-hidden="true"><span>W</span><small>.DOCX</small></span>
      <span className="drop-copy"><strong>{file ? file.name : '拖拽文档到这里'}</strong><span>{file ? `${(file.size / 1024).toFixed(1)} KB · 已选择` : '或点击选择本地 Word 文件'}</span></span>
      <span className="drop-action">{file ? '更换文件' : '选择文件'}</span>
      <span className="file-hint">仅支持 .docx · 最大 50 MB</span>
    </button>
    <input ref={inputRef} id="docx-file" aria-label="选择 DOCX 文件" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden disabled={disabled}
      onChange={e => { accept(e.target.files?.[0]); e.currentTarget.value = '' }} />
    {file && <button className="remove-file" type="button" disabled={disabled} onClick={onRemove}>移除文件</button>}
  </div>
}
