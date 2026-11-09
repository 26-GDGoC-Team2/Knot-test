// 바텀시트 틀: 어두운 배경 + 아래에서 올라오는 유리 패널
function Sheet({ label, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-end justify-center fade-in" onClick={onClose}>
      <section
        role="dialog"
        aria-label={label}
        className="sheet-up w-full max-w-md m-2 rounded-[32px] bg-white p-6 pt-3 flex flex-col gap-5 max-h-[90vh] overflow-y-auto [&>*]:shrink-0" /* 내용이 길어도 버튼 등이 눌려 작아지지 않게 (넘치면 스크롤) */
        onClick={(e) => e.stopPropagation()}
      >
        <span className="self-center w-10 h-1.5 rounded-full bg-gray-300"></span>
        {children}
      </section>
    </div>
  )
}

export default Sheet
