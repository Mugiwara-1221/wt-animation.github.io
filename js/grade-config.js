
// js/grade-config.js
export async function getGradeCaps(gradeId) {
  const url = 'stories/config/grades.json';
  let data;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      console.warn(`Failed to fetch grade config: ${response.status}`);
      return null;
    }
    data = await response.json();
  } catch (e) {
    console.warn('Grade config fetch error:', e);
    return null;
  }

  const validGrades = Object.keys(data.grades || {});
  const safeGradeId = validGrades.includes(gradeId) ? gradeId : 'k-2';
  const config = data.grades[safeGradeId] || {};

  // Normalize palette
  const fullPalette = [
    "#ff6961", "#77dd77", "#fdfd96", "#84b6f4",
    "#fdcae1", "#cfcfc4", "#000000", "#ffffff",
    "#ffb347", "#aec6cf", "#b19cd9", "#c6e2ff"
  ];

  const normalizedPalette = Array.isArray(config.palette)
    ? config.palette
    : fullPalette;

  return {
    ...config,
    palette: normalizedPalette,
    gradeId: safeGradeId
  };
}
