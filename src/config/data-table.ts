export type DataTableConfig = typeof dataTableConfig;

// Constants for the values to avoid duplication
const EQ_VALUE = 'eq' as const;
const IS_NOT_EMPTY_LABEL = 'Is not empty';
const IS_NOT_EMPTY_VALUE = 'isNotEmpty' as const;
const IS_EMPTY_LABEL = 'Is empty';
const IS_EMPTY_VALUE = 'isEmpty' as const;

export const dataTableConfig = {
  textOperators: [
    { label: 'Contains', value: 'iLike' as const },
    { label: 'Does not contain', value: 'notILike' as const },
    { label: 'Is', value: EQ_VALUE },
    { label: 'Is not', value: 'ne' as const },
    { label: IS_EMPTY_LABEL, value: IS_EMPTY_VALUE },
    { label: IS_NOT_EMPTY_LABEL, value: IS_NOT_EMPTY_VALUE },
  ],
  numericOperators: [
    { label: 'Is', value: EQ_VALUE },
    { label: 'Is not', value: 'ne' as const },
    { label: 'Is less than', value: 'lt' as const },
    { label: 'Is less than or equal to', value: 'lte' as const },
    { label: 'Is greater than', value: 'gt' as const },
    { label: 'Is greater than or equal to', value: 'gte' as const },
    { label: 'Is between', value: 'isBetween' as const },
    { label: IS_EMPTY_LABEL, value: IS_EMPTY_VALUE },
    { label: IS_NOT_EMPTY_LABEL, value: IS_NOT_EMPTY_VALUE },
  ],
  dateOperators: [
    { label: 'Is', value: EQ_VALUE },
    { label: 'Is not', value: 'ne' as const },
    { label: 'Is before', value: 'lt' as const },
    { label: 'Is after', value: 'gt' as const },
    { label: 'Is on or before', value: 'lte' as const },
    { label: 'Is on or after', value: 'gte' as const },
    { label: 'Is between', value: 'isBetween' as const },
    { label: 'Is relative to today', value: 'isRelativeToToday' as const },
    { label: IS_EMPTY_LABEL, value: IS_EMPTY_VALUE },
    { label: IS_NOT_EMPTY_LABEL, value: IS_NOT_EMPTY_VALUE },
  ],
  selectOperators: [
    { label: 'Is', value: EQ_VALUE },
    { label: 'Is not', value: 'ne' as const },
    { label: IS_EMPTY_LABEL, value: IS_EMPTY_VALUE },
    { label: IS_NOT_EMPTY_LABEL, value: IS_NOT_EMPTY_VALUE },
  ],
  multiSelectOperators: [
    { label: 'Has any of', value: 'inArray' as const },
    { label: 'Has none of', value: 'notInArray' as const },
    { label: IS_EMPTY_LABEL, value: IS_EMPTY_VALUE },
    { label: IS_NOT_EMPTY_LABEL, value: IS_NOT_EMPTY_VALUE },
  ],
  booleanOperators: [
    { label: 'Is', value: 'eq' as const },
    { label: 'Is not', value: 'ne' as const },
  ],
  sortOrders: [
    { label: 'Asc', value: 'asc' as const },
    { label: 'Desc', value: 'desc' as const },
  ],
  filterVariants: [
    'text',
    'number',
    'range',
    'date',
    'dateRange',
    'boolean',
    'select',
    'multiSelect',
  ] as const,
  operators: [
    'iLike',
    'notILike',
    'eq',
    'ne',
    'inArray',
    'notInArray',
    'isEmpty',
    'isNotEmpty',
    'lt',
    'lte',
    'gt',
    'gte',
    'isBetween',
    'isRelativeToToday',
  ] as const,
  joinOperators: ['and', 'or'] as const,
};
