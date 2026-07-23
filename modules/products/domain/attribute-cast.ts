export type AttributeDataType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE';

export interface AttributeDefinition {
  dataType: AttributeDataType;
}

export interface CastAttributeResult {
  /** Canonical string form persisted in ProductAttributeValue.value. */
  value: string;
  /** Populated only for NUMBER attributes, so Density/Viscosity/Flash Point etc. can be range-queried. */
  valueNumber: number | null;
}

/** Typed parse/validate for a raw attribute value per its ProductAttribute.dataType (doc 12 EAV). */
export function castAttributeValue(
  attribute: AttributeDefinition,
  rawValue: string,
): CastAttributeResult {
  switch (attribute.dataType) {
    case 'NUMBER': {
      const n = Number(rawValue);
      if (Number.isNaN(n)) {
        throw new Error(`Attribute value "${rawValue}" is not a valid number.`);
      }
      return { value: String(n), valueNumber: n };
    }
    case 'BOOLEAN': {
      if (rawValue !== 'true' && rawValue !== 'false') {
        throw new Error(`Attribute value "${rawValue}" is not a valid boolean ("true"/"false").`);
      }
      return { value: rawValue, valueNumber: null };
    }
    case 'DATE': {
      const d = new Date(rawValue);
      if (Number.isNaN(d.getTime())) {
        throw new Error(`Attribute value "${rawValue}" is not a valid date.`);
      }
      return { value: d.toISOString(), valueNumber: null };
    }
    case 'STRING':
    default:
      return { value: rawValue, valueNumber: null };
  }
}
