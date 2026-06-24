import { CustomIconProps } from "@sincpro/mobile-ui/icons/props";
import React from "react";
import Svg, { Path, Rect } from "react-native-svg";

const PrinterIcon: React.FC<CustomIconProps> = ({ size = 24, color = "#000000" }) => (
  <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
    <Path
      d="M6 9V2H18V9"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
    <Rect
      height="8"
      rx="1"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      width="16"
      x="4"
      y="9"
    />
    <Path
      d="M6 18H4C3.44772 18 3 17.5523 3 17V10C3 9.44772 3.44772 9 4 9H20C20.5523 9 21 9.44772 21 10V17C21 17.5523 20.5523 18 20 18H18"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
    <Rect
      height="6"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      width="12"
      x="6"
      y="14"
    />
  </Svg>
);

export default PrinterIcon;
