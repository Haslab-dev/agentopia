// Scene-graph vocabulary (ARCHITECTURE.md §2.1):
// World → District → Building → Floor → Room → PlacedObject.
// AgentAvatar is a World-level sibling, never a Room child.

export type DistrictId = 'office' | 'research' | 'recreation' | 'social' | 'residential' | 'outdoor'

export type RoomKind =
  | 'lobby' | 'workspace' | 'meeting' | 'office' | 'focus-pod'
  | 'pantry' | 'server' | 'generic'

export type AnchorKind = 'desk' | 'meeting_seat' | 'leisure' | 'rest'

export interface AnchorPoint {
  id: string
  kind: AnchorKind
  roomId: string
  pos: [number, number]
  rotY: number
}
