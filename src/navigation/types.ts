import { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Accueil: undefined;
  Contacts: undefined;
  Cadeaux: { contactId?: string } | undefined;
  Calendrier: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Fiche: { contactId?: string } | undefined;
  Message: { contactId: string };
  Reglages: undefined;
};
