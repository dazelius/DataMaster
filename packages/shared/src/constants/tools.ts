export interface ToolMeta {
  name: string;
  label: string;
  icon: string;
  category: 'data' | 'git' | 'code' | 'integration' | 'artifact' | 'knowledge' | 'asset';
}

export const TOOL_REGISTRY: ToolMeta[] = [
  { name: 'query_game_data', label: '데이터 조회', icon: '📊', category: 'data' },
  { name: 'show_table_schema', label: '테이블 구조', icon: '📋', category: 'data' },
  { name: 'query_git_history', label: 'Git 이력', icon: '📂', category: 'git' },
  { name: 'show_revision_diff', label: '커밋 비교', icon: '🔀', category: 'git' },
  { name: 'create_artifact', label: '문서 생성', icon: '📄', category: 'artifact' },
  { name: 'patch_artifact', label: '문서 수정', icon: '✏️', category: 'artifact' },
  { name: 'read_guide', label: '가이드 참조', icon: '📖', category: 'code' },
  { name: 'search_code', label: '코드 검색', icon: '💻', category: 'code' },
  { name: 'read_code_file', label: '코드 읽기', icon: '💻', category: 'code' },
  { name: 'search_jira', label: 'Jira 검색', icon: '🎫', category: 'integration' },
  { name: 'get_jira_issue', label: 'Jira 이슈', icon: '🎫', category: 'integration' },
  { name: 'search_confluence', label: 'Confluence 검색', icon: '📚', category: 'integration' },
  { name: 'get_confluence_page', label: 'Confluence 문서', icon: '📚', category: 'integration' },
  { name: 'save_knowledge', label: '지식 저장', icon: '🧠', category: 'knowledge' },
  { name: 'read_knowledge', label: '지식 읽기', icon: '🧠', category: 'knowledge' },
  { name: 'search_assets', label: '에셋 검색', icon: '🎨', category: 'asset' },
  { name: 'find_resource_image', label: '이미지 찾기', icon: '🖼️', category: 'asset' },
];

export function getToolMeta(toolName: string): ToolMeta | undefined {
  return TOOL_REGISTRY.find((t) => t.name === toolName);
}

export function getToolLabel(toolName: string): string {
  return getToolMeta(toolName)?.label ?? toolName;
}
