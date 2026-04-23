import React from 'react';
import { useTranslation } from 'react-i18next';

export function Header() {
  const { t } = useTranslation();

  return (
    <header>
      <h1>{t('greeting')}</h1>
      <nav>
        <a href="/">{t('nav.home.title')}</a>
      </nav>
      <p>{t('farewell')}</p>
    </header>
  );
}
