/** Recorded on an inspection task when the inspector confirms the checklist; required to complete it. */
export const INSPECTION_CHECKLIST_NOTE = 'Inspection: cleanliness, room safety and repair completion checked.';

/** Inspection tasks need the checklist before completion. */
export function requiresInspectionChecklist(task: { taskType?: string | null; status?: string | null }) {
  return task.taskType === 'inspection';
}
