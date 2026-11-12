import { useState } from "react"
import { Link } from "react-router-dom"
import Background from "../components/Background"
import BottomNav from "../components/BottomNav"
import PostCard from "../components/PostCard"
import { Tabs, EmptyState } from "../components/ui"
import { useStore } from "../lib/store-context"
import { ME } from "../data"
import { isOpen } from "../lib/helpers"

// 내 모집글 (REQ-014)
function MyPostsPage() {
  const { posts } = useStore()
  const [tab, setTab] = useState("all")

  const mine = posts.filter((p) => p.authorId === ME)
  const openPosts = mine.filter(isOpen)
  const donePosts = mine.filter((p) => !isOpen(p))
  const list = tab === "open" ? openPosts : tab === "done" ? donePosts : mine

  return (
    <Background>
      <h1 className="text-2xl font-semibold mb-5">내 모집글</h1>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "all", label: "전체", count: mine.length },
          { value: "open", label: "모집 중", count: openPosts.length },
          { value: "done", label: "모집 완료", count: donePosts.length },
        ]}
      />
      <div className="flex flex-col gap-3 mt-5">
        {list.length === 0 ? (
          <EmptyState
            title="아직 모집글이 없어요"
            desc="함께할 팀원을 찾고 있다면 모집글을 올려 보세요"
            action={<Link to="/posts/new" className="h-12 px-6 rounded-full bg-ink text-white text-sm font-medium inline-flex items-center">모집글 쓰기</Link>}
          />
        ) : (
          list.map((p) => <PostCard key={p.id} post={p} />)
        )}
      </div>
      <BottomNav />
    </Background>
  )
}

export default MyPostsPage
