import { fieldListToProperties, getEnumValues } from './structured_markdown.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildObjectProperties(
  subFields: unknown
): { properties: Record<string, unknown>; required: string[] } {
  const subProperties = fieldListToProperties(subFields);
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [name, def] of Object.entries(subProperties)) {
    properties[name] = fieldToJsonSchema(def);
    if (def.required === true) {
      required.push(name);
    }
  }

  return { properties, required };
}

export function fieldToJsonSchema(fieldDef: Record<string, unknown>): Record<string, unknown> {
  const typeMap: Record<string, Record<string, unknown>> = {
    string: { type: 'string' },
    number: { type: 'number' },
    date: { type: 'string', format: 'date' },
    enum: { type: 'string' },
    array: { type: 'array' },
    object: { type: 'object' }
  };

  const fieldType = typeof fieldDef.type === 'string' ? fieldDef.type : 'string';
  const prop: Record<string, unknown> = { ...(typeMap[fieldType] ?? { type: 'string' }) };

  if (fieldType === 'enum') {
    const values = getEnumValues(fieldDef);
    if (values.length > 0) {
      prop.enum = values;
    }
  }

  if (fieldType === 'array' && isRecord(fieldDef.items)) {
    const items = fieldDef.items;
    const itemType = typeof items.type === 'string' ? items.type : 'string';

    if (itemType === 'enum') {
      const values = getEnumValues(items);
      prop.items = values.length > 0 ? { type: 'string', enum: values } : { type: 'string' };
    } else if (itemType === 'object') {
      if (isRecord(items.properties)) {
        prop.items = { type: 'object', properties: items.properties };
      } else {
        const { properties, required } = buildObjectProperties(items.sub_fields);
        const objectItems: Record<string, unknown> = { type: 'object', properties };
        if (required.length > 0) {
          objectItems.required = required;
        }
        prop.items = objectItems;
      }
    } else {
      prop.items = fieldToJsonSchema(items);
    }
  }

  if (fieldType === 'object') {
    if (isRecord(fieldDef.properties)) {
      prop.properties = fieldDef.properties;
    } else {
      const { properties, required } = buildObjectProperties(fieldDef.sub_fields);
      if (Object.keys(properties).length > 0) {
        prop.properties = properties;
      }
      if (required.length > 0) {
        prop.required = required;
      }
    }
  }

  if (typeof fieldDef.description === 'string') {
    prop.description = fieldDef.description;
  }

  if ('example' in fieldDef) {
    prop.examples = [fieldDef.example];
  }

  if ('default' in fieldDef) {
    prop.default = fieldDef.default;
  }

  if (typeof fieldDef.format === 'string' && !('format' in prop)) {
    prop.format = fieldDef.format;
  }

  return prop;
}

export function enumSetFromField(fieldDef: unknown): Set<string> {
  if (!isRecord(fieldDef)) {
    return new Set();
  }

  const fieldType = fieldDef.type;

  if (fieldType === 'enum') {
    return new Set(getEnumValues(fieldDef));
  }

  if (fieldType === 'array' && isRecord(fieldDef.items) && fieldDef.items.type === 'enum') {
    return new Set(getEnumValues(fieldDef.items));
  }

  return new Set();
}
