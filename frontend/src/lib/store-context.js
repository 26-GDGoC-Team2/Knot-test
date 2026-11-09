import { createContext, useContext } from "react"

export const StoreContext = createContext(null)

// 어느 화면에서든 useStore()로 데이터와 함수를 꺼내 씀
export function useStore() {
  return useContext(StoreContext)
}
