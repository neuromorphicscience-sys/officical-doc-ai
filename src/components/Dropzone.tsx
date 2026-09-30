import { useRef, useState } from 'react'

interface Props {
  file?: File
  onFile: (file: File) => void
  disabled?: boolean
  onInvalidFile?: (message: string) => void
}

export default function Dropzone({ file, onFile, disabled, onInvalidFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const accept = (candidate?: File) => {
    if (!candidate) return
    if (!candidate.name.toLowerCase().endsWith('.docx')) {
      onInvalidFile?.('文件格式不受支持：当前版本仅支持 .docx。')
      return
    }
    onFile(candidate)
  }

  return (
    <div
      className={`dropzone ${dragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''} ${file ? 'has-file' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (!disabled) accept(e.dataTransfer.files?.[0])
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        disabled={disabled}
        onChange={(e) => {
          accept(e.target.files?.[0])
          e.currentTarget.value = ''
        }}
      />
      <div className="drop-icon"><span>W</span><small>.DOCX</small></div>
      <div className="drop-copy">
        <strong>{file ? file.name : '拖拽 DOCX 到这里'}</strong>
        <span>{file ? `${(file.size / 1024).toFixed(1)} KB · 点击可更换文件` : '或点击选择本地文件'}</span>
      </div>
      <div className="drop-action">{file ? '更换' : '选择文件'}</div>
      <p>仅在浏览器本地读取 OOXML；不会把原始 Word 文件上传到业务服务器。</p>
    </div>
  )
}
