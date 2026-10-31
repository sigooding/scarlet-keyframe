declare module "*.jpg" {
  const url: string;
  export default url;
}

declare module "*.jpg?inline" {
  const dataUrl: string;
  export default dataUrl;
}

declare module "*.png?inline" {
  const dataUrl: string;
  export default dataUrl;
}

declare module "*.pdf?inline" {
  const url: string;
  export default url;
}
