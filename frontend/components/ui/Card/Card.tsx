'use client';

import AntCard from 'antd/es/card';
import type { CardProps } from 'antd/es/card';
import type { ComponentType } from 'react';

/**
 * Typed Card wrapper for Ant Design + React 19 compatibility.
 */
const Card = AntCard as unknown as ComponentType<CardProps>;

export default Card;
export type { CardProps };
