// The portfolio is an operator-selected working set. Saved project URLs still resolve
// against the complete inventory; ordinary navigation stays within current work.
export function projectGroups(projects, portfolio) {
  const data = portfolio?.data;
  if (!data) return [];
  if (!data.configured) return [['Projects', projects]];
  const active = data.projects.map(id => projects.find(project => project.id === id)).filter(Boolean);
  const workspace = projects.filter(project => project.id === 'dogfood' && !data.projects.includes(project.id));
  return [['Current projects', active], ['Workspace', workspace]].filter(([, items]) => items.length);
}
export function projectChoices(projects, portfolio) { return projectGroups(projects, portfolio).flatMap(([, items]) => items); }
