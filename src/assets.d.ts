declare module "*.jpg" {
  const url: string;
  export default url;
}

declare module "*.pdf?inline" {
  const url: string;
  export default url;
}
