/**
 * filterTranslations.js
 * Plain-English lookup dictionary for Ansible/Jinja2 filters.
 * Used by the Pipeline View to annotate each transformation step.
 */

export const FILTER_TRANSLATIONS = {
  // String
  lower:         { label: 'Lowercase',       desc: 'Converts the string to all lowercase characters.' },
  upper:         { label: 'Uppercase',       desc: 'Converts the string to all uppercase characters.' },
  trim:          { label: 'Trim whitespace', desc: 'Removes leading and trailing whitespace.' },
  replace:       { label: 'Replace',         desc: 'Replaces all occurrences of a substring with another.' },
  regex_replace: { label: 'Regex replace',   desc: 'Replaces text matching a regex pattern.' },
  regex_search:  { label: 'Regex search',    desc: 'Returns the first regex match, or empty string.' },
  split:         { label: 'Split',           desc: 'Splits the string into a list by a separator.' },
  join:          { label: 'Join',            desc: 'Joins a list into a single string with a separator.' },
  string:        { label: 'To string',       desc: 'Casts the value to a string.' },
  quote:         { label: 'Shell-quote',     desc: 'Wraps the string in single quotes for safe shell use.' },
  b64encode:     { label: 'Base64 encode',   desc: 'Encodes the string as Base64.' },
  b64decode:     { label: 'Base64 decode',   desc: 'Decodes a Base64 string.' },
  hash:          { label: 'Hash',            desc: 'Hashes the value (sha1 by default).' },
  password_hash: { label: 'Password hash',   desc: 'Creates a secure password hash.' },

  // Numeric
  int:           { label: 'To integer',      desc: 'Casts the value to an integer.' },
  float:         { label: 'To float',        desc: 'Casts the value to a floating-point number.' },
  abs:           { label: 'Absolute value',  desc: 'Returns the absolute (non-negative) numeric value.' },
  round:         { label: 'Round',           desc: 'Rounds to a given number of decimal places.' },

  // Lists / Sets
  list:          { label: 'To list',         desc: 'Converts the value to a list.' },
  unique:        { label: 'Deduplicate',     desc: 'Removes duplicate items from the list.' },
  flatten:       { label: 'Flatten',         desc: 'Collapses a nested list into a single-level list.' },
  sort:          { label: 'Sort',            desc: 'Sorts the list alphabetically or numerically.' },
  reverse:       { label: 'Reverse',         desc: 'Reverses the order of items in the list.' },
  first:         { label: 'First item',      desc: 'Returns the first element of the list.' },
  last:          { label: 'Last item',       desc: 'Returns the last element of the list.' },
  length:        { label: 'Length / Count',  desc: 'Returns the number of items in the list or string.' },
  count:         { label: 'Count',           desc: 'Returns the number of matching items.' },
  min:           { label: 'Minimum',         desc: 'Returns the smallest value in the list.' },
  max:           { label: 'Maximum',         desc: 'Returns the largest value in the list.' },
  sum:           { label: 'Sum',             desc: 'Adds up all numeric values in the list.' },
  map:           { label: 'Map / Extract',   desc: 'Extracts a specific attribute from every object in the list.' },
  select:        { label: 'Filter (select)', desc: 'Keeps only items that pass a test.' },
  reject:        { label: 'Filter (reject)', desc: 'Removes items that pass a test.' },
  selectattr:    { label: 'Select by attr',  desc: 'Keeps objects where a named attribute meets a condition.' },
  rejectattr:    { label: 'Reject by attr',  desc: 'Removes objects where a named attribute meets a condition.' },
  zip:           { label: 'Zip',             desc: 'Pairs items from two lists by position.' },
  product:       { label: 'Cartesian product', desc: 'Creates every combination of two lists.' },

  // Dictionaries
  combine:       { label: 'Merge dicts',     desc: 'Merges two or more dictionaries; later keys win.' },
  dict2items:    { label: 'Dict → items',    desc: 'Converts a dict to a list of {key, value} pairs.' },
  items2dict:    { label: 'Items → dict',    desc: 'Converts a list of {key, value} pairs back to a dict.' },

  // Type / Serialisation
  to_json:       { label: 'To JSON',         desc: 'Serialises the value as a JSON string.' },
  from_json:     { label: 'From JSON',       desc: 'Parses a JSON string into a structured value.' },
  to_yaml:       { label: 'To YAML',         desc: 'Serialises the value as a YAML string.' },
  bool:          { label: 'To boolean',      desc: 'Converts yes/no/true/false/1/0 to a boolean.' },
  type_debug:    { label: 'Type debug',      desc: 'Returns the Python type name of the value (for debugging).' },

  // Path
  dirname:       { label: 'Directory name',  desc: 'Returns the directory part of a file path.' },
  basename:      { label: 'File name',       desc: 'Returns the filename portion of a path.' },
  expanduser:    { label: 'Expand ~',        desc: 'Replaces ~ with the actual home directory path.' },
  realpath:      { label: 'Real path',       desc: 'Resolves the absolute real filesystem path.' },

  // Logic
  default:       { label: 'Default value',   desc: 'Returns a fallback value if the variable is undefined or empty.' },
  mandatory:     { label: 'Mandatory',       desc: 'Raises an error if the variable is undefined.' },
  ternary:       { label: 'Ternary (if/else)', desc: 'Returns one of two values depending on the condition.' },
}

/**
 * Describe a filter step in plain English.
 * filterName: string, args: string[] (raw arg strings from parse)
 */
export function describeFilter(filterName, args = []) {
  const entry = FILTER_TRANSLATIONS[filterName]
  if (!entry) return { label: filterName, desc: `Apply filter: ${filterName}` }
  return {
    label: entry.label,
    desc: args.length > 0
      ? `${entry.desc} Args: ${args.join(', ')}.`
      : entry.desc,
  }
}
