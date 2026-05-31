import { useState } from "react";
import type { ObjectCategory } from "@/lib/config";
import { StyleForm } from "./StyleForm";

const CATEGORIES: ObjectCategory[] = ["car", "real-estate", "item"];
const CATEGORY_LABELS: Record<ObjectCategory, string> = {
  car: "Car",
  "real-estate": "Real Estate",
  item: "Item",
};

export function StyleCreatePage() {
  const [category, setCategory] = useState<ObjectCategory>("car");

  function handleCategoryChange(newCategory: ObjectCategory) {
    setCategory(newCategory);
  }

  function handleSuccess(style: { category: string }) {
    window.location.assign(`/styles?category=${style.category}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-3 text-sm font-medium text-white/60">Category</p>
        <div className="flex flex-wrap gap-3">
          {CATEGORIES.map((cat) => (
            <label key={cat} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="category"
                value={cat}
                checked={category === cat}
                onChange={() => {
                  handleCategoryChange(cat);
                }}
                className="accent-purple-500"
              />
              <span className={`text-sm ${category === cat ? "text-white" : "text-white/60"}`}>
                {CATEGORY_LABELS[cat]}
              </span>
            </label>
          ))}
        </div>
      </div>

      <StyleForm
        key={category}
        category={category}
        onSuccess={handleSuccess}
        onCancel={() => {
          window.history.back();
        }}
      />
    </div>
  );
}
