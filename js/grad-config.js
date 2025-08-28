
export async function getGradeCaps(gradeId) {
  const url = 'stories/config/grades.json';
  const data = await (await fetch(url)).json();
  return data.grades[gradeId] || data.grades['k-2'];
}
