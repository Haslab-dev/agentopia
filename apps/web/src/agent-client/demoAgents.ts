import type { AgentDef } from '@living-world/shared-types'

// Model labels are display metadata only — Phase 1 runs in DEMO mode and no
// LLM is connected. Live execution is "Integration Required".
export const AGENT_DEFS: AgentDef[] = [
  { id: 'ceo',        name: 'Aria',   role: 'CEO',            modelLabel: 'GPT-6.1 (label only)',      shirt: '#f59e4c', pants: '#3c4a5a', hair: '#2b2320', skin: '#f2c79b', deskIndex: -1 },
  { id: 'manager',    name: 'Bimo',   role: 'Manager',        modelLabel: 'Claude (label only)',       shirt: '#7fb3e0', pants: '#4a4a52', hair: '#17130f', skin: '#c68863', deskIndex: -2 },
  { id: 'programmer', name: 'Citra',  role: 'Programmer',     modelLabel: 'GPT-6.1 Code (label only)', shirt: '#5f9e6e', pants: '#2f3b33', hair: '#3a2417', skin: '#e8b08a', deskIndex: 0 },
  { id: 'designer',   name: 'Dimas',  role: 'UI/UX Designer', modelLabel: 'Gemini (label only)',       shirt: '#e07a9b', pants: '#51455e', hair: '#241d2e', skin: '#f2c79b', deskIndex: 1 },
  { id: 'research',   name: 'Eka',    role: 'Research',       modelLabel: 'Claude (label only)',       shirt: '#e8d44d', pants: '#5a5340', hair: '#101010', skin: '#a06a42', deskIndex: 2 },
  { id: 'data',       name: 'Farah',  role: 'Data Analyst',   modelLabel: 'GPT-6.1 (label only)',      shirt: '#6ec3c9', pants: '#33454f', hair: '#4a2c14', skin: '#e8b08a', deskIndex: 3 },
  { id: 'copy',       name: 'Gilang', role: 'Copywriter',     modelLabel: 'Gemini (label only)',       shirt: '#b48ce0', pants: '#453a52', hair: '#1c1712', skin: '#c68863', deskIndex: 4 },
  { id: 'marketing',  name: 'Hana',   role: 'Marketing',      modelLabel: 'Claude (label only)',       shirt: '#e0654f', pants: '#4f3833', hair: '#5a3319', skin: '#f2c79b', deskIndex: 5 },
  { id: 'qa',         name: 'Irfan',  role: 'QA',             modelLabel: 'GPT-6.1 Code (label only)', shirt: '#7a8ce0', pants: '#333a52', hair: '#0f0f12', skin: '#8a5636', deskIndex: 6 },
  { id: 'admin',      name: 'Jaya',   role: 'Admin',          modelLabel: 'Gemini Flash (label only)', shirt: '#9db38a', pants: '#4c5145', hair: '#2e2a24', skin: '#e8b08a', deskIndex: 7 },
]
