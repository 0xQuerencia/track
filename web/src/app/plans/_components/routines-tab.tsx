import { Panel } from "@/components/track/page";
import { listRoutines, type RoutineItem } from "@/lib/plans/routines";
import { CreateRoutineForm, RemoveButton, RoutineItemForm, ApplyRoutineButton } from "./routine-forms";

function describeDays(days: string | null): string {
  return days ? days.split(",").join(", ") : "Every day";
}

function itemLine(item: RoutineItem): string {
  return [item.time_of_day, describeDays(item.days_of_week)].filter(Boolean).join(" · ");
}

/** Routine templates: named lists of items that become today's tasks when applied. */
export function RoutinesTab() {
  const routines = listRoutines();
  return (
    <div className="pl-routines">
      <Panel
        title="Routines"
        description="A routine is a reusable list. Apply it to today to create one task per item; applying it again adds nothing twice."
      >
        <details className="tk-add" open={routines.length === 0}>
          <summary>Add routine</summary>
          <CreateRoutineForm />
        </details>
        {routines.length === 0 ? (
          <p className="tk-empty">No routines yet. Create one for a morning start, a workout day or a wind-down.</p>
        ) : (
          <div className="pl-routine-list">
            {routines.map((routine) => (
              <article key={routine.id} className="pl-routine" id={`routines-${routine.id}`}>
                <header>
                  <div>
                    <h3>{routine.name}</h3>
                    {routine.description ? <p className="pl-goal-meta">{routine.description}</p> : null}
                  </div>
                  <div className="pl-routine-tools">
                    <ApplyRoutineButton routineId={routine.id} disabled={routine.items.length === 0} />
                    <RemoveButton label={routine.name} kind="routine" id={routine.id} />
                  </div>
                </header>
                {routine.items.length === 0 ? (
                  <p className="tk-empty tk-empty-small">No items yet.</p>
                ) : (
                  <ol className="pl-routine-items">
                    {routine.items.map((item) => (
                      <li key={item.id}>
                        <span>{item.title}</span>
                        <small>{itemLine(item)}</small>
                        <RemoveButton label={item.title} kind="item" id={item.id} />
                      </li>
                    ))}
                  </ol>
                )}
                <details className="pl-disclosure">
                  <summary>Add item</summary>
                  <RoutineItemForm routineId={routine.id} />
                </details>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
