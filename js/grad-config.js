
/*export async function getGradeCaps(gradeId) {
  //const url = 'stories/config/grades.json';
  const url = 'https://mugiwara-1221.github.io/wt-animation.github.io/stories/config/grades.json';
  const data = await (await fetch(url)).json();
  return data.grades[gradeId] || data.grades['k-2'];
}*/

export async function getGradeCaps(gradeId) {
  const url = 'stories/config/grades.json';
  const response = await fetch(url);

  if (!response.ok) {
    console.warn(`Failed to fetch grade config: ${response.status}`);
    return null;
  }

  const data = await response.json();
  const validGrades = Object.keys(data.grades);

  // Validate gradeId
  const safeGradeId = validGrades.includes(gradeId) ? gradeId : 'k-2';
  const config = data.grades[safeGradeId];

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

