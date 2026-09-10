import { makeMutable } from 'react-native-reanimated';

// Shared value partagée entre les écrans (qui poussent leur position de scroll) et la
// FloatingTabBar (qui lit cette valeur pour s'estomper/réapparaître) — pas besoin de contexte
// React, une SharedValue créée au niveau module reste la même instance partout où elle est
// importée.
export const tabBarHidden = makeMutable(0); // 0 = visible, 1 = masquée
