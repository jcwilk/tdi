import { StyledComponentProps } from "@mui/material";
import * as React from "react";

export function shallowEqual(object1: any, object2: any) {
  if (object1 === object2) {
    //console.log("comp equal true!")
    return true;
  }

  const keys1 = Object.keys(object1);
  const keys2 = Object.keys(object2);

  if (keys1.length !== keys2.length) {
    //console.log("comp length mismatch!")
    return false;
  }

  const everyMatch = keys1.every(key => {
    //console.log("comp everyMatch key", key, object1[key], object2[key], object1[key] === object2[key])
    return object2.hasOwnProperty(key) && object1[key] === object2[key];
  });
  //console.log("comp everyMatch", everyMatch, object1, object2)
  return everyMatch;
}

type customizedExtraArgs = {
  [key: string]: unknown
}

export function customizeComponent<T extends StyledComponentProps, U extends customizedExtraArgs, V extends T & U>(Component: React.ComponentType<T> & {muiName?: string}, getProps: (args: V) => T): React.FC<V> & {muiName?: string} {
  const CustomComponent: React.FC<V> & {muiName?: string} = (componentArgs) => {
    const props = getProps(componentArgs);
    return <Component {...props} />;
  };

  CustomComponent.muiName = Component.muiName;

  return CustomComponent;
}
