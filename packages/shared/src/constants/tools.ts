export interface ToolMeta {
  name: string;
  label: string;
  icon: string;
  category: 'data' | 'git' | 'code' | 'integration' | 'knowledge' | 'asset';
}

export const TOOL_REGISTRY: ToolMeta[] = [
  { name: 'query_game_data', label: '데이터 조회', icon: '📊', category: 'data' },
  { name: 'show_table_schema', label: '테이블 구조', icon: '📋', category: 'data' },
  { name: 'query_git_history', label: 'Git 이력', icon: '📂', category: 'git' },
  { name: 'show_revision_diff', label: '커밋 비교', icon: '🔀', category: 'git' },
  { name: 'search_code', label: '코드 검색', icon: '💻', category: 'code' },
  { name: 'read_code_file', label: '코드 읽기', icon: '💻', category: 'code' },
  { name: 'search_jira', label: 'Jira 검색', icon: '🎫', category: 'integration' },
  { name: 'get_jira_issue', label: 'Jira 이슈', icon: '🎫', category: 'integration' },
  { name: 'search_confluence', label: 'Confluence 검색', icon: '📚', category: 'integration' },
  { name: 'get_confluence_page', label: 'Confluence 문서', icon: '📚', category: 'integration' },
  { name: 'save_knowledge', label: '지식 저장', icon: '🧠', category: 'knowledge' },
  { name: 'read_knowledge', label: '지식 읽기', icon: '🧠', category: 'knowledge' },
  { name: 'wiki_search', label: '위키 검색', icon: '📖', category: 'knowledge' },
  { name: 'wiki_read', label: '위키 읽기', icon: '📖', category: 'knowledge' },
  { name: 'wiki_write', label: '위키 작성', icon: '✍️', category: 'knowledge' },
  { name: 'search_strings', label: '스트링 검색', icon: '🌐', category: 'data' },
  { name: 'get_string', label: '스트링 조회', icon: '🌐', category: 'data' },
  { name: 'string_stats', label: '스트링 통계', icon: '🌐', category: 'data' },
  { name: 'query_string_data', label: '스트링 쿼리', icon: '🌐', category: 'data' },
  { name: 'search_assets', label: '에셋 검색', icon: '🎨', category: 'asset' },
  { name: 'find_resource_image', label: '이미지 찾기', icon: '🖼️', category: 'asset' },
  { name: 'reverse_fk_lookup', label: '역방향 참조', icon: '🔗', category: 'data' },
  { name: 'data_change_impact', label: '변경 영향', icon: '💥', category: 'knowledge' },
  { name: 'confluence_extract_config', label: '설정값 추출', icon: '📐', category: 'integration' },
  { name: 'wiki_dependency_graph', label: '의존성 그래프', icon: '🕸️', category: 'knowledge' },
  { name: 'wiki_revert', label: '위키 복구', icon: '⏪', category: 'knowledge' },
  { name: 'wiki_create_from_template', label: '템플릿 생성', icon: '📝', category: 'knowledge' },
  { name: 'data_diff_summary', label: '데이터 변경 비교', icon: '🔄', category: 'data' },
];

export function getToolMeta(toolName: string): ToolMeta | undefined {
  return TOOL_REGISTRY.find((t) => t.name === toolName);
}

export function getToolLabel(toolName: string): string {
  return getToolMeta(toolName)?.label ?? toolName;
}
