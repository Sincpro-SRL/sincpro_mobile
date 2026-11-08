import DatePicker from "@sincpro/mobile-ui/Form/Form.DatePicker";
import Input from "@sincpro/mobile-ui/Form/Form.Input";
import Select from "@sincpro/mobile-ui/Form/Form.Select";
import { Typography } from "@sincpro/mobile-ui/Typography";
import {
  type CriteriaCondition,
  type CriteriaField,
  type CriteriaGroup,
  type CriteriaValue,
  describeCriteria,
  parseCriteriaDate,
  validateCondition,
} from "@sincpro/mobile-ui/utils/criteria";
import { ListViewV2 } from "@sincpro/mobile-ui/views/ListViewV2";
import { useState } from "react";
import { Pressable, View } from "react-native";

function blank(field: CriteriaField): CriteriaCondition {
  return {
    kind: "condition",
    field: field.id,
    operator: field.operators[0]?.id ?? "equal",
    values: [],
  };
}

function dateStamp(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function CriteriaEditor({
  fields,
  value,
  onChange,
}: {
  fields: readonly CriteriaField[];
  value: CriteriaGroup;
  onChange: (value: CriteriaGroup) => void;
}) {
  const first = fields[0];
  const [row, setRow] = useState<CriteriaCondition>(blank(first));
  const [error, setError] = useState<string>();
  const field = fields.find((item) => item.id === row.field) ?? first;
  const operator =
    field.operators.find((item) => item.id === row.operator) ?? field.operators[0];
  const slots = operator?.arity === "range" ? 2 : operator?.arity === "one" ? 1 : 0;

  const chooseField = (id: string) => {
    const next = fields.find((item) => item.id === id) ?? first;
    setRow(blank(next));
    setError(undefined);
  };

  const updateValue = (index: number, next: CriteriaValue) => {
    const values = [...row.values];
    values[index] = next;
    setRow({ ...row, values });
    setError(undefined);
  };

  const add = () => {
    const next: CriteriaCondition = {
      ...row,
      values:
        field.type === "number"
          ? row.values.map((item) =>
              typeof item === "string" && !item.trim() ? Number.NaN : Number(item),
            )
          : row.values,
    };
    const problem = validateCondition(next, fields);
    if (problem) {
      setError(problem);
      return;
    }
    onChange({ ...value, children: [...value.children, next] });
    setRow({ ...row, values: [] });
    setError(undefined);
  };

  return (
    <View className="gap-3">
      <Select
        label="Campo"
        onChange={chooseField}
        options={fields.map((item) => ({ label: item.label, value: item.id }))}
        value={row.field}
      />
      <ListViewV2.Header.Filters.Chips>
        {field.operators.map((item) => (
          <ListViewV2.Header.Filters.Chip
            active={row.operator === item.id}
            key={item.id}
            label={item.label}
            onPress={() => {
              setRow({ ...row, operator: item.id, values: [] });
              setError(undefined);
            }}
          />
        ))}
      </ListViewV2.Header.Filters.Chips>
      {Array.from({ length: slots }, (_, index) => {
        const label = slots === 2 ? (index === 0 ? "Desde" : "Hasta") : "Valor";
        if (field.type === "choice") {
          const current = row.values[index];
          return (
            <Select
              key={label}
              label={label}
              onChange={(next) => updateValue(index, next)}
              options={(field.options ?? []).flatMap((option) =>
                typeof option.value === "boolean"
                  ? []
                  : [{ label: option.label, value: option.value }],
              )}
              placeholder="Seleccionar"
              value={
                typeof current === "string" || typeof current === "number" ? current : null
              }
            />
          );
        }
        if (field.type === "date") {
          return (
            <DatePicker
              key={label}
              label={label}
              onChange={(date) => updateValue(index, dateStamp(date))}
              value={parseCriteriaDate(row.values[index])}
            />
          );
        }
        return (
          <Input
            key={label}
            keyboardType={field.type === "number" ? "numbers-and-punctuation" : "default"}
            label={label}
            onChangeText={(next) => updateValue(index, next)}
            value={row.values[index] == null ? "" : String(row.values[index])}
          />
        );
      })}
      {error ? (
        <Typography.Text className="text-danger" variant="caption">
          {error}
        </Typography.Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={add}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Typography.Text className="text-text-accent">Añadir condición</Typography.Text>
      </Pressable>
      {value.children.length > 1 ? (
        <ListViewV2.Header.Filters.Chips>
          {(
            [
              ["all", "Todas"],
              ["any", "Alguna"],
              ["none", "Ninguna"],
            ] as const
          ).map(([id, label]) => (
            <ListViewV2.Header.Filters.Chip
              active={value.join === id}
              key={id}
              label={label}
              onPress={() => onChange({ ...value, join: id })}
            />
          ))}
        </ListViewV2.Header.Filters.Chips>
      ) : null}
      {value.children.map((child, index) => (
        <View
          className="flex-row items-center gap-3 border-b border-border-light py-2"
          key={index}
        >
          <Typography.Text className="flex-1" numberOfLines={2} variant="caption">
            {describeCriteria(child, fields)}
          </Typography.Text>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              onChange({
                ...value,
                children: value.children.filter((_, position) => position !== index),
              })
            }
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Typography.Text className="text-danger" variant="caption">
              Quitar
            </Typography.Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
