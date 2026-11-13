import type { DatabaseSync } from "node:sqlite";

/**
 * A starter list of Class 12 PCM chapters, so Study HQ is not empty on day
 * one. It is typed from the published CBSE chapter titles and is editable:
 * check it against the current official syllabus before relying on it.
 */
const CLASS_12_STARTER: Record<string, readonly string[]> = {
  Physics: [
    "Electric Charges and Fields",
    "Electrostatic Potential and Capacitance",
    "Current Electricity",
    "Moving Charges and Magnetism",
    "Magnetism and Matter",
    "Electromagnetic Induction",
    "Alternating Current",
    "Electromagnetic Waves",
    "Ray Optics and Optical Instruments",
    "Wave Optics",
    "Dual Nature of Radiation and Matter",
    "Atoms",
    "Nuclei",
    "Semiconductor Electronics",
  ],
  Chemistry: [
    "Solutions",
    "Electrochemistry",
    "Chemical Kinetics",
    "The d- and f-Block Elements",
    "Coordination Compounds",
    "Haloalkanes and Haloarenes",
    "Alcohols, Phenols and Ethers",
    "Aldehydes, Ketones and Carboxylic Acids",
    "Amines",
    "Biomolecules",
  ],
  Mathematics: [
    "Relations and Functions",
    "Inverse Trigonometric Functions",
    "Matrices",
    "Determinants",
    "Continuity and Differentiability",
    "Application of Derivatives",
    "Integrals",
    "Application of Integrals",
    "Differential Equations",
    "Vector Algebra",
    "Three Dimensional Geometry",
    "Linear Programming",
    "Probability",
  ],
};

export function seedDatabase(db: DatabaseSync): void {
  const done = db.prepare("SELECT value FROM meta WHERE key = 'seeded'").get();
  if (done) return;

  db.exec("BEGIN");
  try {
    const insertChapter = db.prepare(
      `INSERT INTO chapters (subject, klass, track, name, priority, mastery, done)
       VALUES (?, '12', 'Both', ?, 'Medium', 0, 0)`,
    );
    for (const [subject, names] of Object.entries(CLASS_12_STARTER)) {
      for (const name of names) insertChapter.run(subject, name);
    }
    db.prepare(
      `INSERT INTO exams (name, date, target_pct, notes)
       VALUES ('Preboards', '2026-11-20', 80, 'Target 80%, then 90%+ in boards')`,
    ).run();
    db.prepare("INSERT INTO meta (key, value) VALUES ('seeded', '1')").run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
