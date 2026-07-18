import type { EditorContext } from "./editor-context";
import type { Project, Section } from "./edit-transactions";

export type ImmediateEditorCommand =
  | { action: "play" }
  | { action: "pause" }
  | { action: "undo" }
  | { action: "redo" }
  | { action: "apply_proposal" }
  | { action: "discard_proposal" }
  | { action: "audition_current" }
  | { action: "audition_proposed" }
  | { action: "clear_loop" }
  | { action: "seek_section"; sectionId: string; label: string; startBar: number }
  | { action: "loop_section"; sectionId: string; label: string; startBar: number; lengthBars: number };

function referencedSection(input: string, project: Project, context: EditorContext): Section | null {
  const sections = project.sections;
  if (/这里|当前位置|from here|current position/i.test(input)) {
    return sections.find((section) => section.id === context.activeSection?.id) ?? null;
  }
  if (/这一段|这段|这个段落|this section|selected section/i.test(input)) {
    return sections.find((section) => section.id === context.selectedSection?.id)
      ?? sections.find((section) => section.id === context.activeSection?.id)
      ?? null;
  }

  const kind = /前奏|intro/i.test(input) ? "intro"
    : /尾奏|outro/i.test(input) ? "outro"
      : /间奏|break/i.test(input) ? "break"
        : /主歌|verse/i.test(input) ? "verse"
          : /副歌|chorus/i.test(input) ? "chorus"
            : null;
  if (!kind) return null;
  const matches = sections.filter((section) => section.kind === kind);
  if (!matches.length) return null;
  if (/最后|末尾|final|last/i.test(input)) return matches.at(-1)!;
  if (/第二|第2|second/i.test(input)) return matches[1] ?? matches.at(-1)!;
  return matches[0];
}

export function routeImmediateEditorCommand(input: string, project: Project, context: EditorContext): ImmediateEditorCommand | null {
  const normalized = input.trim();
  if (!normalized) return null;

  if (/^(撤销|undo)(一下|刚才|上一步)?[。.!！]?$/i.test(normalized)) return { action: "undo" };
  if (/^(重做|redo)(一下|刚才|下一步)?[。.!！]?$/i.test(normalized)) return { action: "redo" };
  if (context.activeProposal && /^(应用|确认|就这样|采用|apply|commit|looks good|keep it)[。.!！]?$/i.test(normalized)) return { action: "apply_proposal" };
  if (context.activeProposal && /^(丢弃|不要了|取消修改|discard|reject)(这个|这次| proposal)?[。.!！]?$/i.test(normalized)) return { action: "discard_proposal" };
  if (context.activeProposal && /^(听|播放|切到)?(原版|当前版本|修改前|current|original)[。.!！]?$/i.test(normalized)) return { action: "audition_current" };
  if (context.activeProposal && /^(听|播放|切到)?(修改后|新版|提案|proposed|new version)[。.!！]?$/i.test(normalized)) return { action: "audition_proposed" };
  if (/取消循环|停止循环|播放整首|clear loop|stop looping/i.test(normalized)) return { action: "clear_loop" };

  const section = referencedSection(normalized, project, context);
  if (section && /循环|loop/i.test(normalized)) {
    return { action: "loop_section", sectionId: section.id, label: section.label, startBar: section.startBar, lengthBars: section.lengthBars };
  }
  if (section && /^(播放|跳到|跳去|定位到|从).*(前奏|主歌|副歌|间奏|尾奏|这一段|这段|这里|intro|verse|chorus|break|outro|section|here)/i.test(normalized)) {
    return { action: "seek_section", sectionId: section.id, label: section.label, startBar: section.startBar };
  }

  if (/^(播放|继续|继续播放|play|resume)[。.!！]?$/i.test(normalized)) return { action: "play" };
  if (/^(暂停|停止播放|pause|stop)[。.!！]?$/i.test(normalized)) return { action: "pause" };
  return null;
}
