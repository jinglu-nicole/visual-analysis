/**
 * [WHO]: 提供 App 默认导出组件, ImageDropZone / SeverityFilter / AnalysisResult 子组件
 * [FROM]: 依赖 react, react-markdown, lucide-react, analyzer.js 及 App.css 样式
 * [TO]: 被 main.jsx 挂载为根组件；纯前端直接调用 Claude API（无后端依赖，可部署 Netlify）
 * [HERE]: frontend/src/App.jsx — React SPA 主组件；包含完整 UI 逻辑和所有子组件
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Eye, EyeOff, ChevronDown,
  AlertCircle, AlertTriangle, CheckCircle2, Loader2, X, Plus
} from 'lucide-react'
import { compareImages } from './analyzer.js'
import './App.css'

const SEVERITY_CONFIG = {
  '🔴': { label: '高', color: '#dc3545', bg: '#dc35450f', icon: AlertCircle },
  '🟡': { label: '中', color: '#c58c00', bg: '#c58c000f', icon: AlertTriangle },
  '🟢': { label: '低', color: '#198754', bg: '#1987540f', icon: CheckCircle2 },
}

function ImageDropZone({ label, sublabel, image, onImageChange }) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) onImageChange(file)
  }, [onImageChange])

  const handlePaste = useCallback((e) => {
    const items = [...(e.clipboardData?.items || [])]
    const imgItem = items.find(i => i.type.startsWith('image/'))
    if (imgItem) {
      e.preventDefault()
      onImageChange(imgItem.getAsFile())
    }
  }, [onImageChange])

  useEffect(() => {
    const el = inputRef.current?.closest('.drop-zone')
    if (!el) return
    const handler = (e) => handlePaste(e)
    el.addEventListener('paste', handler)
    return () => el.removeEventListener('paste', handler)
  }, [handlePaste])

  const preview = image ? URL.createObjectURL(image) : null

  return (
    <div
      className={`drop-zone ${dragOver ? 'drag-over' : ''} ${image ? 'has-image' : ''}`}
      tabIndex={0}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files[0] && onImageChange(e.target.files[0])}
      />
      {preview ? (
        <div className="preview-wrapper">
          <img src={preview} alt={label} className="preview-image" />
          <div className="preview-bar">
            <span className="preview-label">{label}</span>
            <button
              className="remove-btn"
              onClick={(e) => { e.stopPropagation(); onImageChange(null) }}
              title="移除图片"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="drop-placeholder">
          <Plus size={24} strokeWidth={1.5} />
          <span className="drop-label">{label}</span>
          <span className="drop-sublabel">{sublabel}</span>
          <span className="drop-hint">拖放、粘贴或点击上传</span>
        </div>
      )}
    </div>
  )
}

function SeverityFilter({ filters, onChange }) {
  return (
    <div className="severity-filters">
      {Object.entries(SEVERITY_CONFIG).map(([emoji, cfg]) => {
        const active = filters.includes(emoji)
        const Icon = cfg.icon
        return (
          <button
            key={emoji}
            className={`severity-chip ${active ? 'active' : ''}`}
            style={{
              '--chip-color': cfg.color,
              '--chip-bg': active ? cfg.bg : 'transparent',
            }}
            onClick={() => {
              onChange(active ? filters.filter(f => f !== emoji) : [...filters, emoji])
            }}
          >
            <Icon size={13} /> {cfg.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 按 ## 二级标题拆分 markdown 为多个段落
 */
function splitByH2(text) {
  const sections = []
  const lines = text.split('\n')
  let current = null

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections.push(current)
      current = { title: line.replace(/^## /, '').trim(), lines: [] }
    } else {
      if (current) {
        current.lines.push(line)
      } else {
        // 在第一个 ## 之前的内容
        if (line.trim()) {
          current = { title: '', lines: [line] }
        }
      }
    }
  }
  if (current) sections.push(current)

  return sections.map(s => ({ title: s.title, content: s.lines.join('\n').trim() }))
}

/**
 * 对"问题清单"类段落按严重度筛选
 */
function filterBySeverity(content, filters) {
  if (filters.length === 3) return content // 全选不需要过滤

  const lines = content.split('\n')
  const result = []
  let skipBlock = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('🔴') || trimmed.startsWith('🟡') || trimmed.startsWith('🟢')) {
      skipBlock = !filters.some(f => trimmed.startsWith(f))
      if (!skipBlock) result.push(line)
    } else {
      if (!skipBlock) result.push(line)
    }
  }
  return result.join('\n')
}

function AnalysisResult({ text, filters }) {
  if (!text) return null

  const sections = splitByH2(text)

  // 如果没能拆出任何段落，直接整段渲染
  if (sections.length === 0) {
    return (
      <div className="analysis-result analysis-result--full">
        <div className="result-section">
          <div className="markdown-content">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        </div>
      </div>
    )
  }

  // 判断一个 section 是否是"问题清单"类（含 🔴🟡🟢）
  const isIssueSection = (s) =>
    s.content.includes('🔴') || s.content.includes('🟡') || s.content.includes('🟢')

  return (
    <div className="analysis-result analysis-result--full">
      {sections.map((section, idx) => {
        const content = isIssueSection(section)
          ? filterBySeverity(section.content, filters)
          : section.content

        // 判断 section 类型以加样式类
        const titleLower = section.title.toLowerCase()
        const isTree = titleLower.includes('组件树')
        const isScore = titleLower.includes('评分')

        return (
          <div
            key={idx}
            className={`result-section ${isTree ? 'tree-section' : ''} ${isScore ? 'score-section' : ''}`}
          >
            {section.title && (
              <h3 className="section-title">{section.title}</h3>
            )}
            <div className={`markdown-content ${isIssueSection(section) ? 'issues-content' : ''}`}>
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function App() {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [baseUrl, setBaseUrl] = useState('https://ai.leihuo.netease.com/')
  const [thinkingBudget, setThinkingBudget] = useState(0.18)
  const [canvasW, setCanvasW] = useState(2100)
  const [canvasH, setCanvasH] = useState(1080)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [artImage, setArtImage] = useState(null)
  const [gameImage, setGameImage] = useState(null)

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [filters, setFilters] = useState(['🔴', '🟡', '🟢'])

  const canAnalyze = apiKey.trim() && artImage && gameImage && !loading

  const handleAnalyze = async () => {
    if (!canAnalyze) return
    setLoading(true)
    setError('')
    setResult('')

    try {
      const text = await compareImages(artImage, gameImage, {
        apiKey: apiKey.trim(),
        baseUrl,
        thinkingBudget,
        canvasWidth: canvasW,
        canvasHeight: canvasH,
      })
      setResult(text)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">Visual Diff</h1>
          <span className="app-divider" />
          <p className="app-subtitle">游戏美术还原度检查</p>
        </div>
      </header>

      <main className="main-content">
        {/* Config */}
        <div className="config-bar">
          <div className="config-fields">
            <div className="field key-field-group">
              <label className="field-label">API Key</label>
              <div className="input-with-action">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="input"
                />
                <button className="input-action" onClick={() => setShowKey(!showKey)} title={showKey ? '隐藏' : '显示'}>
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div className="field url-field-group">
              <label className="field-label">服务商 URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="input"
              />
            </div>
            <button
              className={`toggle-more ${settingsOpen ? 'open' : ''}`}
              onClick={() => setSettingsOpen(!settingsOpen)}
              title="更多设置"
            >
              <ChevronDown size={16} />
            </button>
          </div>

          {settingsOpen && (
            <div className="config-extra">
              <div className="field">
                <label className="field-label">Thinking 预算 ${thinkingBudget.toFixed(2)}</label>
                <input
                  type="range"
                  min="0.01" max="0.18" step="0.01"
                  value={thinkingBudget}
                  onChange={(e) => setThinkingBudget(parseFloat(e.target.value))}
                  className="range"
                />
              </div>
              <div className="field">
                <label className="field-label">画布宽度</label>
                <input
                  type="number"
                  value={canvasW}
                  onChange={(e) => setCanvasW(parseInt(e.target.value) || 2100)}
                  className="input input-narrow"
                />
              </div>
              <div className="field">
                <label className="field-label">画布高度</label>
                <input
                  type="number"
                  value={canvasH}
                  onChange={(e) => setCanvasH(parseInt(e.target.value) || 1080)}
                  className="input input-narrow"
                />
              </div>
            </div>
          )}
        </div>

        {/* Upload */}
        <div className="upload-area">
          <ImageDropZone
            label="设计稿"
            sublabel="目标效果"
            image={artImage}
            onImageChange={setArtImage}
          />
          <ImageDropZone
            label="实机截图"
            sublabel="实际还原"
            image={gameImage}
            onImageChange={setGameImage}
          />
        </div>

        {/* Action */}
        <div className="action-area">
          <button
            className={`analyze-btn ${loading ? 'is-loading' : ''}`}
            disabled={!canAnalyze}
            onClick={handleAnalyze}
          >
            {loading ? (
              <><Loader2 size={16} className="spin" /> 分析中…</>
            ) : (
              '开始分析'
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="error-banner">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="results-area">
            <div className="results-header">
              <h2 className="results-title">分析报告</h2>
              <SeverityFilter filters={filters} onChange={setFilters} />
            </div>
            <AnalysisResult text={result} filters={filters} />
          </div>
        )}
      </main>

      <footer className="app-footer">
        Powered by Claude &middot; Visual Diff Tool
      </footer>
    </div>
  )
}
