import React, { useState, useEffect } from "react";
import { Plus, Trash2, Check, Target } from "lucide-react";
import { goalsRepo, DbGoal } from "../lib/db";

export const Goals: React.FC = () => {
  const [goals, setGoals] = useState<DbGoal[]>([]);
  const [goalInput, setGoalInput] = useState("");
  const [loaded, setLoaded] = useState(false);

  const loadGoals = async () => {
    try {
      const list = await goalsRepo.list();
      setGoals(list);
    } catch (err) {
      console.error("Failed to load goals:", err);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    loadGoals();
    // Refresh when goals change elsewhere (e.g. an approved agent action)
    const onUpdated = () => loadGoals();
    window.addEventListener("activity-updated", onUpdated);
    return () => window.removeEventListener("activity-updated", onUpdated);
  }, []);

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = goalInput.trim();
    if (!title) return;
    setGoalInput("");
    try {
      const newGoal = await goalsRepo.add(title);
      setGoals((prev) => [newGoal, ...prev]);
      window.dispatchEvent(new CustomEvent("activity-updated"));
    } catch (err) {
      console.error("Failed to add goal:", err);
    }
  };

  const handleToggleDone = async (goal: DbGoal) => {
    const nextDone = goal.done ? 0 : 1;
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, done: nextDone } : g)));
    try {
      await goalsRepo.setDone(goal.id, nextDone === 1);
      window.dispatchEvent(new CustomEvent("activity-updated"));
    } catch (err) {
      console.error("Failed to update goal:", err);
      // Roll back the optimistic update on failure
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, done: goal.done } : g)));
    }
  };

  const handleDeleteGoal = async (id: number) => {
    try {
      await goalsRepo.remove(id);
      setGoals((prev) => prev.filter((g) => g.id !== id));
      window.dispatchEvent(new CustomEvent("activity-updated"));
    } catch (err) {
      console.error("Failed to delete goal:", err);
    }
  };

  const formatCreatedDate = (createdAt: number) => {
    return new Date(createdAt).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="w-full max-w-[1100px] flex flex-col gap-6 px-8 pb-16 mt-8 select-none">
      {/* Header */}
      <div className="flex flex-col gap-1.5 border-b border-border-hairline pb-4">
        <h1 className="font-serif text-[36px] font-normal text-text-primary tracking-tight">
          Goals
        </h1>
        <p className="font-sans text-[14px] text-text-muted leading-relaxed">
          Track what you want to get done. Agents can propose goals here too — nothing is added without your approval.
        </p>
      </div>

      {/* Goals card */}
      <div className="card-style p-6 flex flex-col gap-5 max-w-[720px] w-full">
        {/* Manual add */}
        <form onSubmit={handleAddGoal} className="flex gap-2">
          <input
            type="text"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            placeholder="Add a new goal..."
            className="flex-1 px-3 py-2 bg-card-surface border border-border-hairline rounded-xl font-sans text-[13px] outline-none placeholder:text-text-faint"
          />
          <button
            type="submit"
            className="px-3 rounded-xl bg-text-primary text-card-surface hover:bg-text-muted transition-colors cursor-pointer"
          >
            <Plus size={16} strokeWidth={2} />
          </button>
        </form>

        {/* Goal list */}
        <div className="flex flex-col">
          {goals.map((goal, idx) => (
            <div key={goal.id} className="flex flex-col">
              {idx > 0 && <div className="h-px bg-border-hairline w-full" />}
              <div className="group flex items-center gap-3 py-3">
                {/* Done toggle */}
                <button
                  onClick={() => handleToggleDone(goal)}
                  title={goal.done ? "Mark as open" : "Mark as done"}
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all duration-150 active:scale-90 cursor-pointer ${
                    goal.done
                      ? "bg-text-primary border-text-primary"
                      : "bg-card-surface border-border-hairline hover:border-text-muted"
                  }`}
                >
                  {goal.done ? (
                    <Check size={11} strokeWidth={2.5} className="text-card-surface" />
                  ) : null}
                </button>

                {/* Title + created date */}
                <div className="flex flex-col min-w-0 flex-1">
                  <span
                    className={`font-sans text-[14px] leading-snug ${
                      goal.done ? "text-text-faint line-through" : "text-text-primary"
                    }`}
                  >
                    {goal.title}
                  </span>
                  <span className="font-sans text-[11px] text-text-faint">
                    Added {formatCreatedDate(goal.created_at)}
                  </span>
                </div>

                {/* Delete */}
                <button
                  onClick={() => handleDeleteGoal(goal.id)}
                  title="Delete goal"
                  className="opacity-0 group-hover:opacity-100 transition-all duration-150 text-text-muted hover:text-red-600 p-1.5 rounded hover:bg-active-hover active:scale-90 cursor-pointer shrink-0"
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}

          {/* Empty state */}
          {loaded && goals.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10">
              <Target size={22} strokeWidth={1.5} className="text-text-faint" />
              <span className="font-serif text-[16px] text-text-muted italic">
                No goals yet
              </span>
              <span className="font-sans text-[12px] text-text-faint">
                Add one above, or let the Coach propose one for you.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
