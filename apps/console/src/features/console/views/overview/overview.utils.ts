const idrFormat = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
export const formatIdr = (value: number) => idrFormat.format(value);

const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
export const formatUsd = (value: number) => usdFormat.format(value);

export const formatCount = (value: number) => value.toLocaleString();
