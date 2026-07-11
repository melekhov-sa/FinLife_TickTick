"use client";

import { useState, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import {
  X, Plus, Trash2, Bold as BoldIcon, Italic as ItalicIcon,
  Underline as UnderlineIcon, List as BulletList, ListOrdered,
  Link as LinkIcon, ImageIcon, Heading2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useKeyboardInset } from "@/lib/useKeyboardInset";
import {
  type Dish, type DishIngredient,
  useCreateDish, useUpdateDish, useReplaceIngredients, useUploadDishImage,
} from "@/hooks/useDishes";

const MEAL_TYPE_OPTIONS = [
  { key: "breakfast", label: "Завтрак" },
  { key: "snack",     label: "Перекус" },
  { key: "lunch",     label: "Обед" },
  { key: "dinner",    label: "Ужин" },
];

interface Props {
  dish?: Dish | null;
  onClose: () => void;
  onSaved?: (dish: Dish) => void;
}

interface IngredientRow {
  id?: number;
  ingredient_name: string;
  quantity: string;
  unit: string;
}

function parseMealTypes(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.split(",").map((t) => t.trim()).filter(Boolean);
}

export function DishModal({ dish, onClose, onSaved }: Props) {
  const { inset: kbInset, vvHeight } = useKeyboardInset();
  const isEdit = !!dish;

  const [name, setName] = useState(dish?.name ?? "");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(parseMealTypes(dish?.meal_types));
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    dish?.ingredients?.map((i) => ({
      id: i.id,
      ingredient_name: i.ingredient_name,
      quantity: i.quantity ?? "",
      unit: i.unit ?? "",
    })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { mutateAsync: createDish } = useCreateDish();
  const { mutateAsync: updateDish } = useUpdateDish();
  const { mutateAsync: replaceIngredients } = useReplaceIngredients();
  const { mutateAsync: uploadImage } = useUploadDishImage();

  // Track dish ID for image uploads during creation (need dish ID first)
  const savedDishIdRef = useRef<number | null>(dish?.id ?? null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "underline text-indigo-600 dark:text-indigo-400", rel: "noopener noreferrer", target: "_blank" },
      }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: dish?.instructions ?? "",
    editorProps: {
      attributes: {
        class: "dish-instructions-editor focus:outline-none min-h-[160px] prose prose-sm dark:prose-invert max-w-none px-3 py-2.5",
      },
    },
  });

  function toggleType(key: string) {
    setSelectedTypes((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]
    );
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, { ingredient_name: "", quantity: "", unit: "" }]);
  }

  function removeIngredient(idx: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateIngredient(idx: number, field: keyof IngredientRow, value: string) {
    setIngredients((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  }

  const handleImageUpload = useCallback(async (file: File) => {
    if (!savedDishIdRef.current) {
      setError("Сначала сохраните блюдо, чтобы загрузить изображение");
      return;
    }
    try {
      const { url } = await uploadImage({ dishId: savedDishIdRef.current, file });
      editor?.chain().focus().insertContent({ type: "image", attrs: { src: url } }).run();
    } catch {
      setError("Ошибка загрузки изображения");
    }
  }, [editor, uploadImage]);

  function handleImageButtonClick() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleImageUpload(file);
    };
    input.click();
  }

  async function handleSave() {
    if (!name.trim()) { setError("Введите название блюда"); return; }
    setSaving(true);
    setError(null);

    try {
      const instructions = editor?.getHTML() ?? null;
      const mealTypes = selectedTypes.join(",") || null;
      const ingPayload = ingredients
        .filter((i) => i.ingredient_name.trim())
        .map((i, idx) => ({
          ingredient_name: i.ingredient_name.trim(),
          quantity: i.quantity.trim() || null,
          unit: i.unit.trim() || null,
          sort_order: idx,
        }));

      let saved: Dish;
      if (isEdit && dish) {
        saved = await updateDish({ id: dish.id, name: name.trim(), meal_types: mealTypes, instructions });
        await replaceIngredients({ dishId: dish.id, ingredients: ingPayload });
        saved = { ...saved, ingredients: ingPayload.map((i, idx) => ({ id: dish.ingredients[idx]?.id ?? 0, ...i, quantity: i.quantity ?? null, unit: i.unit ?? null })) };
      } else {
        saved = await createDish({ name: name.trim(), meal_types: mealTypes, instructions, ingredients: ingPayload });
        savedDishIdRef.current = saved.id;
      }

      onSaved?.(saved);
      onClose();
    } catch {
      setError("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ paddingBottom: kbInset }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full sm:max-w-2xl sm:mx-4 sm:rounded-2xl flex flex-col overflow-hidden"
        style={{
          background: "var(--app-card-bg)",
          border: "1px solid var(--app-border)",
          maxHeight: kbInset > 0 && vvHeight ? `${vvHeight - 12}px` : "92dvh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--app-border)" }}>
          <h2 className="flex-1 text-[15px] font-semibold" style={{ color: "var(--t-primary)" }}>
            {isEdit ? "Редактировать блюдо" : "Новое блюдо"}
          </h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg nav-hover" style={{ color: "var(--t-muted)" }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scroll-slim px-4 py-4 space-y-5">
          {error && (
            <div className="text-[13px] text-red-500 bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{error}</div>
          )}

          {/* Name */}
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--t-faint)" }}>
              Название *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название блюда…"
              className="w-full rounded-xl px-3 py-2 text-[14px] outline-none border focus:border-indigo-400"
              style={{ background: "var(--app-input-bg, var(--app-card-bg))", borderColor: "var(--app-border)", color: "var(--t-primary)" }}
            />
          </div>

          {/* Meal types */}
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--t-faint)" }}>
              Тип приёма пищи
            </label>
            <div className="flex flex-wrap gap-2">
              {MEAL_TYPE_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleType(key)}
                  className={cn(
                    "px-3 py-1 rounded-full text-[13px] font-medium border transition-colors",
                    selectedTypes.includes(key)
                      ? "bg-indigo-500 border-indigo-500 text-white"
                      : "border-[var(--app-border)] hover:border-indigo-300"
                  )}
                  style={!selectedTypes.includes(key) ? { color: "var(--t-secondary)" } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--t-faint)" }}>
              Ингредиенты
            </label>
            <div className="space-y-2">
              {ingredients.map((ing, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    value={ing.ingredient_name}
                    onChange={(e) => updateIngredient(idx, "ingredient_name", e.target.value)}
                    placeholder="Ингредиент"
                    className="flex-1 rounded-lg px-2.5 py-1.5 text-[13px] outline-none border focus:border-indigo-400 min-w-0"
                    style={{ background: "var(--app-input-bg, var(--app-card-bg))", borderColor: "var(--app-border)", color: "var(--t-primary)" }}
                  />
                  <input
                    value={ing.quantity}
                    onChange={(e) => updateIngredient(idx, "quantity", e.target.value)}
                    placeholder="Кол-во"
                    className="w-20 rounded-lg px-2.5 py-1.5 text-[13px] outline-none border focus:border-indigo-400"
                    style={{ background: "var(--app-input-bg, var(--app-card-bg))", borderColor: "var(--app-border)", color: "var(--t-primary)" }}
                  />
                  <input
                    value={ing.unit}
                    onChange={(e) => updateIngredient(idx, "unit", e.target.value)}
                    placeholder="ед."
                    className="w-16 rounded-lg px-2.5 py-1.5 text-[13px] outline-none border focus:border-indigo-400"
                    style={{ background: "var(--app-input-bg, var(--app-card-bg))", borderColor: "var(--app-border)", color: "var(--t-primary)" }}
                  />
                  <button type="button" onClick={() => removeIngredient(idx)} className="w-7 h-7 flex items-center justify-center rounded-lg nav-hover shrink-0" style={{ color: "var(--t-faint)" }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addIngredient}
                className="flex items-center gap-1.5 text-[13px] font-medium px-2 py-1.5 rounded-lg nav-hover"
                style={{ color: "var(--app-accent)" }}
              >
                <Plus size={14} />
                Добавить ингредиент
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--t-faint)" }}>
              Способ приготовления
            </label>
            <div
              className="rounded-xl border focus-within:border-indigo-400 transition-colors overflow-hidden"
              style={{ borderColor: "var(--app-border)", background: "var(--app-card-bg)" }}
            >
              {/* Toolbar */}
              {editor && (
                <div className="flex items-center gap-0.5 px-1.5 py-1 border-b flex-wrap" style={{ borderColor: "var(--app-border)" }}>
                  <TipBtn title="Жирный" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><BoldIcon size={13} /></TipBtn>
                  <TipBtn title="Курсив" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><ItalicIcon size={13} /></TipBtn>
                  <TipBtn title="Подчёркивание" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={13} /></TipBtn>
                  <span className="w-px h-4 mx-1" style={{ background: "var(--app-border)" }} />
                  <TipBtn title="Заголовок" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={13} /></TipBtn>
                  <TipBtn title="Маркированный список" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><BulletList size={13} /></TipBtn>
                  <TipBtn title="Нумерованный список" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={13} /></TipBtn>
                  <span className="w-px h-4 mx-1" style={{ background: "var(--app-border)" }} />
                  <TipBtn
                    title="Ссылка"
                    active={editor.isActive("link")}
                    onClick={() => {
                      const prev = editor.getAttributes("link").href as string | undefined;
                      const url = window.prompt("URL:", prev ?? "");
                      if (url === null) return;
                      if (!url.trim()) { editor.chain().focus().unsetLink().run(); return; }
                      editor.chain().focus().setLink({ href: url.trim() }).run();
                    }}
                  >
                    <LinkIcon size={13} />
                  </TipBtn>
                  <TipBtn
                    title={isEdit ? "Вставить изображение" : "Сохраните блюдо для загрузки фото"}
                    onClick={handleImageButtonClick}
                  >
                    <ImageIcon size={13} />
                  </TipBtn>
                </div>
              )}
              <EditorContent editor={editor} />
            </div>
            {!isEdit && (
              <p className="text-[11px] mt-1.5" style={{ color: "var(--t-faint)" }}>
                После сохранения блюда вы сможете добавлять изображения в инструкцию
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t shrink-0" style={{ borderColor: "var(--app-border)" }}>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-medium nav-hover" style={{ color: "var(--t-secondary)" }}>
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60 transition-opacity"
            style={{ background: "var(--app-accent-gradient)" }}
          >
            {saving ? "Сохранение…" : isEdit ? "Сохранить" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TipBtn({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={cn(
        "w-7 h-7 rounded-md flex items-center justify-center transition-colors shrink-0",
        active
          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300"
          : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06]"
      )}
    >
      {children}
    </button>
  );
}
