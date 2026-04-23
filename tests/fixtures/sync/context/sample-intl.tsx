import React from 'react';
import { useIntl } from 'react-intl';

export function ItemCount({ count }: { count: number }) {
  const intl = useIntl();

  return (
    <span>
      {intl.formatMessage({ id: 'items_count' }, { count })}
    </span>
  );
}
