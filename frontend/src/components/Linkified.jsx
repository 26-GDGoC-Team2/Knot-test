// 글 속의 http(s):// 주소를 눌러서 열 수 있는 링크로 바꿔 보여줘요 (저장된 글은 그대로, 화면 표시만 바뀌어요)
const URL_RE = /(https?:\/\/[^\s<>"']+)/g
const TRAILING = /[).,;:!?\]}>]+$/ // 문장 끝 문장부호는 주소에서 뺀다

export default function Linkified({ text }) {
  const parts = String(text ?? "").split(URL_RE)
  return parts.map((part, i) => {
    if (i % 2 === 0) return part // 일반 글자 (split 결과의 짝수 칸)
    const tail = part.match(TRAILING)?.[0] ?? ""
    const url = tail ? part.slice(0, -tail.length) : part
    return (
      <span key={i}>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#1A56C4] underline break-all">{url}</a>
        {tail}
      </span>
    )
  })
}
