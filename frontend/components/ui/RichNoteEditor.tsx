"use client";

import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List as BulletListIcon,
  ListOrdered,
  ListChecks,
  Link as LinkIcon,
  Code as CodeIcon,
  Quote,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** Значение поля как Markdown-строка. */
  value: string;
  /** Колбек изменения, получает новую Markdown-строку. */
  onChange: (markdown: string) => void;
  /** Плейсхолдер когда пусто. */
  placeholder?: string;
  /** Заблокировать редактирование. */
  disabled?: boolean;
  /** Минимальная высота области редактирования. */
  minHeight?: number;
  /** Автофокус при маунте. */
  autoFocus?: boolean;
  /** Дополнительный класс для обёртки. */
  className?: string;
}

export function RichNoteEditor({
  value,
  onChange,
  placeholder = "Заметка к задаче…",
  disabled = false,
  minHeight = 120,
  autoFocus = false,
  className,
}: Props) {
  // Guards: avoid triggering onChange for the external value update we just
  // applied via setContent; and avoid writing markdown back on every caret
  // movement.
  const lastSerializedRef = useRef<string>(value);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false, // include via default; TaskList uses its own
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: "underline text-indigo-600 dark:text-indigo-400",
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        breaks: true,
      }),
    ],
    content: value || "",
    onUpdate: ({ editor: ed }) => {
      const store = (ed.storage as unknown as Record<string, MarkdownStorage | undefined>).markdown;
      if (!store) return;
      const md = store.getMarkdown();
      if (md === lastSerializedRef.current) return;
      lastSerializedRef.current = md;
      onChange(md);
    },
    editorProps: {
      attributes: {
        class: cn(
          "rne-content focus:outline-none",
          disabled && "opacity-60 pointer-events-none"
        ),
        "data-placeholder": placeholder,
      },
    },
  });

  // Sync external value → editor when it really changed (e.g. task switched).
  useEffect(() => {
    if (!editor) return;
    if (value === lastSerializedRef.current) return;
    lastSerializedRef.current = value;
    editor.commands.setContent(value || "", { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    if (editor && autoFocus) {
      // Small tick so content is rendered before focus.
      const id = window.setTimeout(() => editor.commands.focus("end"), 0);
      return () => window.clearTimeout(id);
    }
  }, [editor, autoFocus]);

  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) {
    return (
      <div
        className={cn(
          "rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.04]",
          className
        )}
        style={{ minHeight }}
      />
    );
  }

  return (
    <div
      className={cn(
        "rne-wrap rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.04] focus-within:border-indigo-500/40 transition-colors",
        disabled && "opacity-60",
        className
      )}
    >
      {!disabled && <Toolbar editor={editor} />}
      <div style={{ minHeight }} className="px-3 py-2.5">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

interface ToolButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolButton({ onClick, active, disabled, title, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep editor selection
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "w-7 h-7 rounded-md flex items-center justify-center transition-colors shrink-0",
        active
          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300"
          : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06]",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  function toggleLink() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const input = window.prompt("URL ссылки (пусто — убрать):", prev ?? "");
    if (input === null) return;
    if (input.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: input.trim() }).run();
  }

  return (
    <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-slate-100 dark:border-white/[0.05] flex-wrap">
      <ToolButton
        title="Жирный"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <BoldIcon size={14} strokeWidth={2} />
      </ToolButton>
      <ToolButton
        title="Курсив"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon size={14} strokeWidth={2} />
      </ToolButton>
      <ToolButton
        title="Подчёркивание"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon size={14} strokeWidth={2} />
      </ToolButton>

      <span className="w-px h-4 bg-slate-200 dark:bg-white/[0.08] mx-1" />

      <ToolButton
        title="Заголовок 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 size={14} strokeWidth={2} />
      </ToolButton>
      <ToolButton
        title="Заголовок 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 size={14} strokeWidth={2} />
      </ToolButton>
      <ToolButton
        title="Заголовок 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 size={14} strokeWidth={2} />
      </ToolButton>

      <span className="w-px h-4 bg-slate-200 dark:bg-white/[0.08] mx-1" />

      <ToolButton
        title="Маркированный список"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <BulletListIcon size={14} strokeWidth={2} />
      </ToolButton>
      <ToolButton
        title="Нумерованный список"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={14} strokeWidth={2} />
      </ToolButton>
      <ToolButton
        title="Чек-лист"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <ListChecks size={14} strokeWidth={2} />
      </ToolButton>

      <span className="w-px h-4 bg-slate-200 dark:bg-white/[0.08] mx-1" />

      <ToolButton
        title="Цитата"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote size={14} strokeWidth={2} />
      </ToolButton>
      <ToolButton
        title="Код"
        active={editor.isActive("code") || editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <CodeIcon size={14} strokeWidth={2} />
      </ToolButton>
      <ToolButton
        title="Ссылка"
        active={editor.isActive("link")}
        onClick={toggleLink}
      >
        <LinkIcon size={14} strokeWidth={2} />
      </ToolButton>
    </div>
  );
}
