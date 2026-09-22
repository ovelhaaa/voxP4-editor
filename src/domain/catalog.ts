import rawContract from '../../contracts/voxp4-parameters-v1.json';
import { ParameterValue } from './models';

export type ParameterGroup =
  | 'tempo'
  | 'harmony'
  | 'dynamics'
  | 'delay'
  | 'reverb'
  | 'output'
  | 'chorus'
  | 'drive';

export type ParameterType = 'bool' | 'int' | 'float' | 'enum';

export interface ParameterDescriptor {
  readonly name: string;
  readonly key: string;
  readonly display: string;
  readonly group: ParameterGroup;
  readonly type: ParameterType;
  readonly min: number;
  readonly max: number;
  readonly default: number;
  readonly step: number;
  readonly unit: string;
  readonly values?: readonly string[];
}

export interface ParameterContractData {
  readonly contractVersion: number;
  readonly parameterCount: number;
  readonly parameters: readonly ParameterDescriptor[];
}

class ParameterCatalogImpl {
  private readonly descriptorsByName: Map<string, ParameterDescriptor> = new Map();
  private readonly descriptorsByGroup: Map<ParameterGroup, ParameterDescriptor[]> = new Map();
  private readonly allDescriptors: ParameterDescriptor[];
  readonly contractVersion: number;
  readonly parameterCount: number;

  constructor(data: ParameterContractData) {
    this.contractVersion = data.contractVersion;
    this.parameterCount = data.parameterCount;
    this.allDescriptors = [...data.parameters];

    for (const desc of data.parameters) {
      // Exact canonical name lookup only
      this.descriptorsByName.set(desc.name, desc);

      const groupList = this.descriptorsByGroup.get(desc.group) ?? [];
      groupList.push(desc);
      this.descriptorsByGroup.set(desc.group, groupList);
    }
  }

  /**
   * Retrieves a parameter descriptor by its exact canonical semantic name.
   * Returns undefined if unknown.
   */
  getParameter(name: string): ParameterDescriptor | undefined {
    return this.descriptorsByName.get(name);
  }

  /**
   * Checks if a semantic name exists in the catalog.
   */
  hasParameter(name: string): boolean {
    return this.descriptorsByName.has(name);
  }

  /**
   * Returns all parameter descriptors in canonical contract order.
   */
  getAllParameters(): readonly ParameterDescriptor[] {
    return this.allDescriptors;
  }

  /**
   * Returns all parameters belonging to a specific functional group.
   */
  getParametersByGroup(group: ParameterGroup): readonly ParameterDescriptor[] {
    return this.descriptorsByGroup.get(group) ?? [];
  }

  /**
   * Returns all defined groups in display order.
   */
  getGroups(): ParameterGroup[] {
    return ['tempo', 'harmony', 'dynamics', 'delay', 'reverb', 'output', 'chorus', 'drive'];
  }

  /**
   * Returns canonical enum values for a parameter if it is an enum.
   */
  getEnumValues(name: string): readonly string[] | undefined {
    return this.getParameter(name)?.values;
  }

  /**
   * Converts the descriptor default numeric value into its typed domain representation:
   * - bool: true / false
   * - enum: canonical string value from values array
   * - int / float: number
   */
  getDefaultValue(name: string): ParameterValue {
    const desc = this.getParameter(name);
    if (!desc) {
      throw new Error(`Unknown parameter '${name}' requested for default value`);
    }

    switch (desc.type) {
      case 'bool':
        return desc.default > 0.5;
      case 'enum': {
        const idx = Math.round(desc.default);
        if (desc.values && desc.values[idx] !== undefined) {
          return desc.values[idx];
        }
        return desc.values?.[0] ?? '';
      }
      case 'int':
        return Math.round(desc.default);
      case 'float':
        return desc.default;
    }
  }

  /**
   * Validates a typed value against descriptor type, bounds, and enum lists.
   */
  validateValue(
    name: string,
    val: unknown
  ): { valid: boolean; error?: string } {
    const desc = this.getParameter(name);
    if (!desc) {
      return { valid: false, error: `Unknown parameter '${name}'` };
    }

    switch (desc.type) {
      case 'bool':
        if (typeof val !== 'boolean') {
          return { valid: false, error: `Parameter '${name}' expects a boolean (got ${typeof val})` };
        }
        return { valid: true };

      case 'int':
        if (typeof val !== 'number' || !Number.isFinite(val) || !Number.isInteger(val)) {
          return { valid: false, error: `Parameter '${name}' expects an integer (got ${val})` };
        }
        if (val < desc.min || val > desc.max) {
          return {
            valid: false,
            error: `Parameter '${name}' value ${val} out of bounds [${desc.min}, ${desc.max}]`,
          };
        }
        return { valid: true };

      case 'float':
        if (typeof val !== 'number' || !Number.isFinite(val)) {
          return { valid: false, error: `Parameter '${name}' expects a number (got ${val})` };
        }
        if (val < desc.min || val > desc.max) {
          return {
            valid: false,
            error: `Parameter '${name}' value ${val} out of bounds [${desc.min}, ${desc.max}]`,
          };
        }
        return { valid: true };

      case 'enum':
        if (typeof val !== 'string') {
          return { valid: false, error: `Parameter '${name}' expects an enum string (got ${typeof val})` };
        }
        if (!desc.values || !desc.values.includes(val)) {
          const allowed = desc.values?.join(', ') ?? 'none';
          return {
            valid: false,
            error: `Invalid enum value '${val}' for '${name}'. Allowed: [${allowed}]`,
          };
        }
        return { valid: true };
    }
  }
}

export const catalog = new ParameterCatalogImpl(rawContract as unknown as ParameterContractData);
export type ParameterCatalog = ParameterCatalogImpl;
