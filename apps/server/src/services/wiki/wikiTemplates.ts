import type { WikiFrontmatter } from './wikiService.js';

export interface WikiTemplate {
  id: string;
  label: string;
  description: string;
  category: string;
  variables: TemplateVariable[];
  generate: (vars: Record<string, string>) => { frontmatter: WikiFrontmatter; content: string };
}

interface TemplateVariable {
  name: string;
  label: string;
  required: boolean;
  example: string;
}

function v(name: string, label: string, example: string, required = true): TemplateVariable {
  return { name, label, required, example };
}

const skillAnalysis: WikiTemplate = {
  id: 'skill-analysis',
  label: '스킬 완전 분석',
  description: 'Execute 체인, 상태효과, 전략 분석까지 포함하는 스킬 심층 분석 페이지',
  category: 'entities',
  variables: [
    v('character', '캐릭터명', '카야'),
    v('character_en', '캐릭터 영문명', 'Kaya'),
    v('character_id', '캐릭터 ID', '2001'),
    v('skill_id', '스킬 ID', '22010'),
    v('skill_name', '스킬 한글명', '전술 기동'),
    v('skill_name_en', '스킬 영문명', 'Tactical Slide'),
    v('skill_slot', '스킬 슬롯', 'Skill_2'),
    v('string_key', 'StringData 키', 'Active_Desc_200120'),
    v('execute_id', 'SkillExecute ID', '220101', false),
    v('icon_path', '아이콘 경로', '', false),
  ],
  generate(vars) {
    const { character, character_en, character_id, skill_id, skill_name, skill_name_en, skill_slot, string_key, execute_id, icon_path } = vars;
    const charSlug = character_en?.toLowerCase() ?? 'unknown';
    const pageSlug = `${charSlug}-${skill_name_en?.toLowerCase().replace(/\s+/g, '-') ?? skill_id}`;
    const execId = execute_id || `${skill_id}01`;

    const frontmatter: WikiFrontmatter = {
      title: `${character} ${skill_name} (${skill_name_en}) — 완전 분석`,
      tags: [charSlug, skill_name_en?.toLowerCase().replace(/\s+/g, '-') ?? '', 'skill', 'deep-analysis', 'aegis'],
      sources: [
        `table:Skill (id:${skill_id})`,
        `table:SkillExecute (id:${execId})`,
        `table:SkillCondition (skill_fk:${skill_id})`,
        `table:SkillExecuteRange`,
        `table:SkillUI (id:${skill_id})`,
        string_key ? `stringdata:${string_key}` : '',
        `wiki:entities/${charSlug}`,
      ].filter(Boolean),
      confidence: 'medium',
    };

    const iconBlock = icon_path ? `![스킬 아이콘](${icon_path})\n\n` : '';

    const content = `# ${character} ${skill_name} (${skill_name_en}) — 완전 분석

${iconBlock}> **TODO: StringData \`${string_key}\`에서 스킬 설명 삽입**

[[entities/${charSlug}|${character}]]의 ${skill_slot || '스킬'}로, 내부 데이터 기준 Skill ID **${skill_id}**입니다.

관련 문서: [[entities/${charSlug}|${character} 메인]]

---

## 기본 데이터

### 스킬 테이블 (Skill ID: ${skill_id})

:::query
SELECT s.id, s.skill_tool_title, s.skill_type, s.cooldown, s.stack_max, s.change_en_type, s.change_en_value, s.priority, s.movable_rate, s.rotatable_rate, s.is_jumpable, s.max_duration, s.min_skill_delay, s.armor_type FROM Skill s WHERE s.id = ${skill_id}
:::

| 항목 | 값 | 해석 |
|------|-----|------|
| **스킬 타입** | | |
| **쿨다운** | | |
| **에너지** | | |
| **슈퍼아머** | | |

> **TODO: 위 쿼리 결과를 기반으로 해석 표 작성**

### 발동 조건 (SkillCondition)

:::query
SELECT sc.skill_fk, sc.check_condition, sc.condtion_value1, sc.condtion_value2 FROM SkillCondition sc WHERE sc.skill_fk = ${skill_id}
:::

---

## 실행(Execute) 체인

### 데이터 흐름

\`\`\`mermaid
flowchart LR
    SK["Skill ${skill_id}<br/>${skill_name}"] -->|"execute_id1"| SE["SkillExecute ${execId}"]
    SE -->|"execute_range_id"| SR["SkillExeRange"]
    SE -->|"execute_effect_id1"| SEE["SkillExeEffect"]
    SEE -->|"effect_value1"| STE["StatusEffect"]
\`\`\`

> **TODO: 실제 데이터를 조회한 후 Mermaid 다이어그램과 아래 쿼리 ID를 업데이트**

### SkillExecute ${execId}

:::query
SELECT se.id, se.execute_type, se.execute_range_id, se.execute_effect_id1, se.execute_effect_id2, se.damage, se.damage_apply_type FROM SkillExecute se WHERE se.id = ${execId}
:::

### SkillExecuteRange

:::query
SELECT ser.id, ser.range_type, ser.target_type, ser.range_form, ser.range_value1, ser.range_value2, ser.range_value3 FROM SkillExecuteRange ser WHERE ser.id IN (SELECT execute_range_id FROM SkillExecute WHERE id = ${execId})
:::

### SkillExecuteEffect

:::query
SELECT see.id, see.effect_apply_type, see.effect_type, see.effect_value1, see.effect_value2 FROM SkillExecuteEffect see WHERE see.id IN (SELECT execute_effect_id1 FROM SkillExecute WHERE id = ${execId})
:::

---

## 상태효과 (StatusEffect)

> **TODO: SkillExecuteEffect의 effect_value1로 StatusEffect를 추적하여 기록**

:::query
SELECT se.id, se.status_effect_category, se.duration, se.stack_type, se.stack_up_count, se.function_id1, se.function_id2 FROM StatusEffect se WHERE se.id IN (SELECT effect_value1 FROM SkillExecuteEffect WHERE id IN (SELECT execute_effect_id1 FROM SkillExecute WHERE id = ${execId}))
:::

---

## 전략 분석

> **TODO: 실제 데이터를 분석한 뒤 전략적 의미, 콤보 활용, 밸런스 의견 등을 작성**

### 강점

### 약점

### 시너지 / 콤보

---

## 미해결 쟁점

> **TODO: 데이터와 기획서 간 불일치, 확인 필요 사항 등을 기록**`;

    return { frontmatter, content };
  },
};

const characterOverview: WikiTemplate = {
  id: 'character-overview',
  label: '캐릭터 개요',
  description: '캐릭터 기본 정보, 스탯, 장비, 스킬셋 종합 페이지',
  category: 'entities',
  variables: [
    v('character', '캐릭터명', '카야'),
    v('character_en', '캐릭터 영문명', 'Kaya'),
    v('character_id', '캐릭터 ID', '2001'),
    v('class', '클래스', '스트라이커'),
    v('class_en', '클래스 코드', 'Striker'),
    v('stat_id', 'CharacterStat ID', '2001', false),
    v('portrait_path', '초상화 경로', '', false),
  ],
  generate(vars) {
    const { character, character_en, character_id, class: cls, class_en, stat_id, portrait_path } = vars;
    const charSlug = character_en?.toLowerCase() ?? 'unknown';
    const statId = stat_id || character_id;

    const frontmatter: WikiFrontmatter = {
      title: `${character} (${character_en}) — ${cls}`,
      tags: ['character', charSlug, class_en?.toLowerCase() ?? '', 'aegis', 'playable', 'live-data'],
      sources: [
        `table:Character (id:${character_id})`,
        `table:CharacterStat (id:${statId})`,
        'table:CharacterGearSet',
        'table:Weapon',
        'table:WeaponStat',
        'table:Skill',
        'table:Passive',
        'table:StringData',
      ],
      confidence: 'medium',
    };

    const portraitBlock = portrait_path ? `![${character} 초상화](${portrait_path})\n\n` : '';

    const content = `# ${character} (${character_en}) — ${cls}

${portraitBlock}> *TODO: StringData에서 캐릭터 설명 삽입*

**${character}**는 AEGIS의 플레이어블 캐릭터 중 하나로, 내부 코드명 **${class_en}**입니다.

## 기본 정보

:::query
SELECT c.id, str.Korean AS char_name, c.type, c.is_display, c.character_class, c.skill_set_id FROM Character c LEFT JOIN StringData str ON c.name_id = str.[key] WHERE c.id = ${character_id}
:::

| 항목 | 값 |
|------|-----|
| **게임 내 이름** | ${character} (${character_en}) |
| **내부 코드명** | ${class_en} |
| **캐릭터 ID** | ${character_id} |
| **클래스** | ${cls} |

## 캐릭터 스탯

:::query
SELECT cs.id, cs.max_health, cs.max_innate_shield, cs.innate_shield_regen, cs.max_energy FROM CharacterStat cs WHERE cs.id = ${statId}
:::

| 스탯 | 값 | 비고 |
|------|-----|------|
| 체력 (max_health) | | |
| 최대 에너지 (max_energy) | | |
| 고유 실드 (max_innate_shield) | | |
| 실드 재생 (innate_shield_regen) | | |

> **TODO: 쿼리 결과를 기반으로 스탯 표 완성 + 다른 캐릭터와 비교**

### 전체 스탯 비교 (전 캐릭터)

:::query
SELECT c.id, str.Korean AS char_name, c.character_class, cs.max_health, cs.max_innate_shield, cs.max_energy, cs.innate_shield_regen FROM Character c LEFT JOIN StringData str ON c.name_id = str.[key] LEFT JOIN CharacterStat cs ON c.character_stat_id = cs.id WHERE c.type = 'Player' ORDER BY cs.max_health DESC
:::

## 장비 (GearSet)

:::query
SELECT cgs.id, cgs.main_weapon_id_1, cgs.main_weapon_id_2, cgs.sub_weapon_id, cgs.ultimate_weapon_id FROM CharacterGearSet cgs WHERE cgs.id = ${character_id}
:::

> **TODO: 각 무기 상세 정보 표 작성**

## 스킬셋

:::query
SELECT ss.id, ss.skill_1, ss.skill_2, ss.ultimate, ss.passive_set_id FROM SkillSet ss WHERE ss.id = ${character_id}
:::

> **TODO: 각 스킬 요약 + 상세 분석 페이지 링크**

## 패시브

:::query
SELECT p.id, p.passive_type, p.check_condition, p.effect_type, p.effect_value1 FROM Passive p WHERE p.id IN (SELECT passive_id FROM CharacterPassiveSet WHERE id IN (SELECT passive_set_id FROM SkillSet WHERE id = ${character_id}))
:::

## 전략 분석

> **TODO: 캐릭터 역할, 강점/약점, 추천 플레이스타일**`;

    return { frontmatter, content };
  },
};

const conceptDoc: WikiTemplate = {
  id: 'concept-doc',
  label: '시스템/개념 문서',
  description: '게임 시스템이나 메카닉스를 정리하는 허브 문서',
  category: 'concepts',
  variables: [
    v('title', '문서 제목', 'AEGIS 상태효과(StatusEffect) 사전'),
    v('slug', 'URL 경로명', 'status-effects'),
    v('tables', '관련 테이블 (쉼표 구분)', 'StatusEffect, StatusEffectGroup, StatusEffectFunction'),
    v('summary', '한줄 요약', '모든 상태효과를 분류하고 기능 함수, 그룹, 면역 관계를 정리한 허브 문서', false),
  ],
  generate(vars) {
    const { title, slug, tables, summary } = vars;
    const tableList = tables?.split(',').map((t) => t.trim()).filter(Boolean) ?? [];

    const frontmatter: WikiFrontmatter = {
      title,
      tags: [slug, ...tableList.map((t) => t.toLowerCase().replace(/\s+/g, '-')), 'aegis', 'hub-document'],
      sources: tableList.map((t) => `table:${t}`),
      confidence: 'medium',
    };

    const tableOverview = tableList.length > 0
      ? `\n| 테이블 | 역할 | 행 수 |\n|--------|------|-------|\n${tableList.map((t) => `| **${t}** | TODO | |`).join('\n')}\n`
      : '';

    const mermaidNodes = tableList.map((t, i) => `    T${i}["${t}"]`).join('\n');
    const mermaidEdges = tableList.length > 1
      ? tableList.slice(1).map((_, i) => `    T0 --> T${i + 1}`).join('\n')
      : '';

    const content = `# ${title}

> ${summary || 'TODO: 문서 요약 작성'}

## 시스템 개요

이 시스템은 **${tableList.length}개 테이블**이 연동되어 동작합니다:
${tableOverview}

### 데이터 흐름

\`\`\`mermaid
flowchart LR
${mermaidNodes}
${mermaidEdges}
\`\`\`

> **TODO: 실제 FK 관계를 조회하여 Mermaid 다이어그램 업데이트**

## 분류

> **TODO: 주요 카테고리/타입별 분류 작성**

## 상세 데이터

${tableList.map((t) => `### ${t}

:::query
SELECT * FROM ${t} LIMIT 20
:::

> **TODO: 주요 필드 해석 추가**
`).join('\n')}

## 관련 문서

> **TODO: 관련 위키 페이지 [[wikilink]] 추가**`;

    return { frontmatter, content };
  },
};

const weaponAnalysis: WikiTemplate = {
  id: 'weapon-analysis',
  label: '무기 분석',
  description: '무기 데이터, 투사체, 데미지 계산까지 포함하는 무기 심층 분석',
  category: 'entities',
  variables: [
    v('weapon_name', '무기명', '스위프트'),
    v('weapon_name_en', '무기 영문명', 'Swift'),
    v('weapon_id', '무기/Gear ID', '220011'),
    v('owner', '소유 캐릭터', '카야'),
    v('owner_slug', '소유 캐릭터 slug', 'kaya'),
    v('weapon_type', '무기 타입', 'AR', false),
    v('projectile_id', '투사체 ID', '', false),
  ],
  generate(vars) {
    const { weapon_name, weapon_name_en, weapon_id, owner, owner_slug, weapon_type, projectile_id } = vars;
    const slug = weapon_name_en?.toLowerCase().replace(/\s+/g, '-') ?? weapon_id;

    const frontmatter: WikiFrontmatter = {
      title: `${weapon_name} (${weapon_name_en}) — ${weapon_type || '무기'} 분석`,
      tags: [slug, 'weapon', weapon_type?.toLowerCase() ?? '', owner_slug, 'aegis', 'deep-analysis'],
      sources: [
        `table:Gear (id:${weapon_id})`,
        `table:Weapon (id:${weapon_id})`,
        `table:WeaponStat (id:${weapon_id})`,
        projectile_id ? `table:Projectile (id:${projectile_id})` : '',
        `wiki:entities/${owner_slug}`,
      ].filter(Boolean),
      confidence: 'medium',
    };

    const content = `# ${weapon_name} (${weapon_name_en}) — ${weapon_type || '무기'} 분석

[[entities/${owner_slug}|${owner}]]의 무기로, Gear ID **${weapon_id}**입니다.

---

## 무기 기본 속성

:::query
SELECT g.id, w.weapon_type, w.fire_type, w.source_type, w.fire_damage_type, w.projectile_id, w.aim_mode, w.crosshair, w.block_move, w.block_jump FROM Gear g LEFT JOIN Weapon w ON g.id = w.id WHERE g.id = ${weapon_id}
:::

| 항목 | 값 | 해석 |
|------|-----|------|
| **무기 타입** | | |
| **발사 타입** | | |
| **데미지 타입** | | |

> **TODO: 쿼리 결과 기반으로 해석 표 작성**

## 스탯 (WeaponStat)

:::query
SELECT ws.id, ws.damage_base, ws.damage_range_min, ws.damage_range_max, ws.rpm, ws.ammo_max, ws.reload_time, ws.spread_base, ws.spread_max, ws.recoil_vertical, ws.recoil_horizontal FROM WeaponStat ws WHERE ws.id = ${weapon_id}
:::

| 항목 | 값 | 비고 |
|------|-----|------|
| **기본 데미지** | | |
| **RPM** | | |
| **탄약** | | |
| **리로드** | | |

> **TODO: DPS 계산, 다른 무기와 비교**

## 투사체 (Projectile)

:::query
SELECT p.id, p.projectile_type, p.speed, p.gravity, p.life_time, p.damage_area_type, p.damage_area_radius FROM Projectile p WHERE p.id IN (SELECT projectile_id FROM Weapon WHERE id = ${weapon_id})
:::

## 전체 무기 비교

:::query
SELECT g.id, w.weapon_type, ws.damage_base, ws.rpm, ws.ammo_max, CAST(ws.damage_base * ws.rpm / 60.0 AS INT) AS dps_approx FROM Gear g LEFT JOIN Weapon w ON g.id = w.id LEFT JOIN WeaponStat ws ON g.id = ws.id WHERE w.source_type = 'CharacterGear' ORDER BY dps_approx DESC
:::

## 전략 분석

> **TODO: 유효 사거리, TTK, 상황별 추천, 밸런스 의견**`;

    return { frontmatter, content };
  },
};

const comparisonAnalysis: WikiTemplate = {
  id: 'comparison-analysis',
  label: '비교 분석',
  description: '여러 엔티티(캐릭터, 무기 등)를 비교 분석하는 페이지',
  category: 'analysis',
  variables: [
    v('title', '분석 제목', '캐릭터 밸런스 비교'),
    v('slug', 'URL 경로명', 'character-balance'),
    v('subject', '비교 대상', 'character'),
    v('tables', '관련 테이블 (쉼표 구분)', 'Character, CharacterStat, WeaponStat'),
  ],
  generate(vars) {
    const { title, slug, subject, tables } = vars;
    const tableList = tables?.split(',').map((t) => t.trim()).filter(Boolean) ?? [];

    const frontmatter: WikiFrontmatter = {
      title,
      tags: [slug, subject, 'comparison', 'balance', 'analysis', 'aegis'],
      sources: tableList.map((t) => `table:${t}`),
      confidence: 'medium',
    };

    const content = `# ${title}

> 이 문서는 ${subject} 간의 데이터를 비교 분석합니다.

## 개요

> **TODO: 비교 목적과 기준 설명**

## 원시 데이터

${tableList.map((t) => `### ${t}

:::query
SELECT * FROM ${t} LIMIT 30
:::
`).join('\n')}

## 비교 분석

> **TODO: 핵심 비교 표, 차트, 분석 코멘트**

:::chart
type: bar
title: "TODO: 비교 차트"
sql: SELECT id, 'TODO' AS label FROM ${tableList[0] || 'Character'} LIMIT 10
:::

## 발견점

> **TODO: 밸런스 이슈, 아웃라이어, 패턴 등**

## 결론 및 제언

> **TODO: 종합 의견**`;

    return { frontmatter, content };
  },
};

export const WIKI_TEMPLATES: WikiTemplate[] = [
  skillAnalysis,
  characterOverview,
  conceptDoc,
  weaponAnalysis,
  comparisonAnalysis,
];

export function getTemplate(id: string): WikiTemplate | undefined {
  return WIKI_TEMPLATES.find((t) => t.id === id);
}

export function listTemplates(): { id: string; label: string; description: string; category: string; variables: TemplateVariable[] }[] {
  return WIKI_TEMPLATES.map(({ id, label, description, category, variables }) => ({ id, label, description, category, variables }));
}
