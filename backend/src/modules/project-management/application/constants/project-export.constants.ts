export interface BilingualColumn {
  zh: string;
  en: string;
  width: number;
}

export const PROJECT_LIST_EXPORT_COLUMNS: BilingualColumn[] = [
  { zh: '序号', en: 'NO.', width: 8 },
  { zh: '项目名称', en: 'Project Name', width: 36 },
  { zh: '项目编号', en: 'Project Number', width: 18 },
  { zh: '项目状态', en: 'Project Status', width: 18 },
  { zh: '委托单位', en: 'Client', width: 24 },
  {
    zh: '合同签订日期/邮件委托日期',
    en: 'Contract Signing Date / Email Commission Date',
    width: 36,
  },
  { zh: '项目类型', en: 'Project Type', width: 20 },
  {
    zh: '项目总体归属部门',
    en: 'Overall Responsible Department of the Project',
    width: 32,
  },
  { zh: '设计属性', en: 'Design Properties', width: 18 },
  { zh: '设计阶段', en: 'Design Stage', width: 16 },
  { zh: '项目是否上OA', en: 'Whether filed in OA system', width: 22 },
  { zh: '现场责任人', en: 'On-site responsible person', width: 22 },
  { zh: '铁路长度(km)', en: 'Length of Railway (km)', width: 18 },
  { zh: '轨交长度(km)', en: 'Length of Urban Rail Transit (km)', width: 28 },
  { zh: '公路长度(km)', en: 'Length of Road (km)', width: 18 },
  { zh: '建筑面积(㎡)', en: 'Gross Floor Area (㎡)', width: 20 },
  { zh: '对上合同额', en: 'Contract Amount with the Client', width: 24 },
  { zh: '已计价金额', en: 'Certified Amount', width: 18 },
  { zh: '备注', en: 'Remark', width: 28 },
];

export interface ExportDisciplineDefinition {
  label: string;
  aliases: string[];
  designerZh: string;
  reviewerZh: string;
  leaderZh: string;
  deptChiefZh: string;
  instituteChiefZh: string;
}

export const TASK_LIST_STANDARD_COLUMNS: BilingualColumn[] = [
  { zh: '国外任务书编号', en: 'Overseas Task Number', width: 20 },
  { zh: '项目名称', en: 'Project Name', width: 32 },
  { zh: '项目编号', en: 'Project Number', width: 16 },
  { zh: '主要工作内容', en: 'Main Work Content', width: 28 },
  { zh: '归档形式', en: 'Form of Archiving', width: 14 },
  { zh: '委托形式', en: 'Mode of Project Commission', width: 22 },
  { zh: '任务属性', en: 'Task Attributes', width: 16 },
  { zh: '现场接收任务时间', en: 'On-site Task Receiving Time', width: 24 },
  {
    zh: '下达任务国内时间',
    en: 'Time of Domestic Task Assignment',
    width: 26,
  },
  {
    zh: '计划完成任务时间',
    en: 'Planned Task Completion Time',
    width: 24,
  },
  { zh: '联系单编号', en: 'Contact Sheet Number', width: 18 },
  { zh: '设计阶段', en: 'Design Stage', width: 14 },
  { zh: '紧要程度', en: 'Urgency Level', width: 14 },
  {
    zh: '是否制定计表',
    en: 'Whether the work Plan has been made',
    width: 18,
  },
  { zh: '语言', en: 'Language', width: 10 },
  { zh: '任务审核层级', en: 'Task Review Level', width: 18 },
  {
    zh: '任务主管司总/院总',
    en: 'Task Supervising Company Chief Engineer / Department Chief Engineer',
    width: 30,
  },
  { zh: '现场负责人', en: 'On-site responsible person', width: 20 },
  { zh: '调度员', en: 'Scheduler', width: 16 },
];

/**
 * The first 17 standard task columns only - Overseas Task Number through
 * Task Supervising Company Chief Engineer / Department Chief Engineer.
 * Used by the "task list (summary)" export, which omits disciplines and
 * the trailing change-request/commercial columns.
 */
export const TASK_LIST_SUMMARY_EXPORT_COLUMNS: BilingualColumn[] =
  TASK_LIST_STANDARD_COLUMNS.slice(0, 17);

export const TASK_LIST_TRAILING_COLUMNS: BilingualColumn[] = [
  { zh: '实际完成时间', en: 'Actual Completion Time', width: 22 },
  { zh: '完成情况', en: 'Whether Completed on Time', width: 24 },
  { zh: '备注', en: 'Remark', width: 24 },
  { zh: '下达工天', en: 'Assigned Workdays', width: 14 },
  { zh: '预估产值（万元）', en: 'Estimated Output Value', width: 20 },
  { zh: '结算产值(万元)', en: 'Settled Output Value', width: 20 },
  { zh: '是否存在变更', en: 'Change Existence (Y/N)', width: 18 },
  { zh: '变更是否属于合同内', en: 'In-Contract Change (Y/N)', width: 22 },
  { zh: '是否委外', en: 'Subcontract (Y/N)', width: 14 },
  { zh: '委外合同号', en: 'Subcontract Contract No.', width: 20 },
  { zh: '委外合同签订日期', en: 'Subcontract Contract Date', width: 24 },
  {
    zh: '合同要求完成时间',
    en: 'Contract Required Completion Date',
    width: 26,
  },
  { zh: '实际完成时间', en: 'Actual Completion Date', width: 22 },
];

/** Client template discipline order - 13 blocks × 5 role columns each. */
export const EXPORT_DISCIPLINES: ExportDisciplineDefinition[] = [
  {
    label: 'Highway',
    aliases: ['highway'],
    designerZh: '公路设计',
    reviewerZh: '公路复核',
    leaderZh: '公路专业负责人',
    deptChiefZh: '公路部门总工',
    instituteChiefZh: '公路院总',
  },
  {
    label: 'Hydrology',
    aliases: ['hydrology'],
    designerZh: '水文设计',
    reviewerZh: '水文复核',
    leaderZh: '水文专业负责人',
    deptChiefZh: '水文部门总工',
    instituteChiefZh: '水文院总',
  },
  {
    label: 'Structure(Road)',
    aliases: ['structure(road)', 'structureroad', 'structure road'],
    designerZh: '结构(公路)设计',
    reviewerZh: '结构(公路)复核',
    leaderZh: '结构(公路)专业负责人',
    deptChiefZh: '结构(公路)部门总工',
    instituteChiefZh: '结构(公路)院总',
  },
  {
    label: 'Geological',
    aliases: ['geological', 'geology'],
    designerZh: '地质设计',
    reviewerZh: '地质复核',
    leaderZh: '地质专业负责人',
    deptChiefZh: '地质部门总工',
    instituteChiefZh: '地质院总',
  },
  {
    label: 'Pavement/Material',
    aliases: ['pavement/material', 'pavementmaterial', 'pavement material'],
    designerZh: '路面/材料设计',
    reviewerZh: '路面/材料复核',
    leaderZh: '路面/材料专业负责人',
    deptChiefZh: '路面/材料部门总工',
    instituteChiefZh: '路面/材料院总',
  },
  {
    label: 'Survey',
    aliases: ['survey'],
    designerZh: '测量设计',
    reviewerZh: '测量复核',
    leaderZh: '测量专业负责人',
    deptChiefZh: '测量部门总工',
    instituteChiefZh: '测量院总',
  },
  {
    label: 'Architecture',
    aliases: ['architecture'],
    designerZh: '建筑设计',
    reviewerZh: '建筑复核',
    leaderZh: '建筑专业负责人',
    deptChiefZh: '建筑部门总工',
    instituteChiefZh: '建筑院总',
  },
  {
    label: 'Interior Design',
    aliases: ['interior design', 'interiordesign'],
    designerZh: '室内设计',
    reviewerZh: '室内复核',
    leaderZh: '室内专业负责人',
    deptChiefZh: '室内部门总工',
    instituteChiefZh: '室内院总',
  },
  {
    label: 'Landscape Design',
    aliases: ['landscape design', 'landscapedesign'],
    designerZh: '景观设计',
    reviewerZh: '景观复核',
    leaderZh: '景观专业负责人',
    deptChiefZh: '景观部门总工',
    instituteChiefZh: '景观院总',
  },
  {
    label: 'Structure(Building)',
    aliases: ['structure(building)', 'structurebuilding', 'structure building'],
    designerZh: '结构(建筑)设计',
    reviewerZh: '结构(建筑)复核',
    leaderZh: '结构(建筑)专业负责人',
    deptChiefZh: '结构(建筑)部门总工',
    instituteChiefZh: '结构(建筑)院总',
  },
  {
    label: 'Sanitary',
    aliases: ['sanitary'],
    designerZh: '给排水设计',
    reviewerZh: '给排水复核',
    leaderZh: '给排水专业负责人',
    deptChiefZh: '给排水部门总工',
    instituteChiefZh: '给排水院总',
  },
  {
    label: 'Electrical&ICT',
    aliases: [
      'electrical&ict',
      'electrical ict',
      'electrical/ict',
      'electrical and ict',
    ],
    designerZh: '电气信息设计',
    reviewerZh: '电气信息复核',
    leaderZh: '电气信息专业负责人',
    deptChiefZh: '电气信息部门总工',
    instituteChiefZh: '电气信息院总',
  },
  {
    label: 'Mechanical',
    aliases: ['mechanical'],
    designerZh: '机电设计',
    reviewerZh: '机电复核',
    leaderZh: '机电专业负责人',
    deptChiefZh: '机电部门总工',
    instituteChiefZh: '机电院总',
  },
];

export function buildTaskListDisciplineColumns(): BilingualColumn[] {
  const columns: BilingualColumn[] = [];
  for (const discipline of EXPORT_DISCIPLINES) {
    columns.push(
      {
        zh: `${discipline.designerZh}`,
        en: `${discipline.label} Designer`,
        width: 22,
      },
      {
        zh: `${discipline.reviewerZh}`,
        en: `${discipline.label} Reviewer`,
        width: 22,
      },
      {
        zh: `${discipline.leaderZh}`,
        en: `${discipline.label} Discipline Leader`,
        width: 26,
      },
      {
        zh: `${discipline.deptChiefZh}`,
        en: `${discipline.label} Dept Chief Engineer`,
        width: 28,
      },
      {
        zh: `${discipline.instituteChiefZh}`,
        en: `${discipline.label} Institute Chief`,
        width: 24,
      },
    );
  }
  return columns;
}

export function buildTaskListExportColumns(): BilingualColumn[] {
  return [
    ...TASK_LIST_STANDARD_COLUMNS,
    ...buildTaskListDisciplineColumns(),
    ...TASK_LIST_TRAILING_COLUMNS,
  ];
}
