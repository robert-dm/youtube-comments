-- Add Spanish sentiment keywords for better multilingual support

-- Spanish Positive Keywords
INSERT INTO sentiment_keywords (keyword, weight, category) VALUES
('excelente', 8.5, 'positive'),
('increíble', 9.0, 'positive'),
('maravilloso', 8.0, 'positive'),
('fantástico', 9.0, 'positive'),
('genial', 7.5, 'positive'),
('bueno', 6.0, 'positive'),
('muy bueno', 8.0, 'positive'),
('perfecto', 9.5, 'positive'),
('magnífico', 9.0, 'positive'),
('hermoso', 7.5, 'positive'),
('bonito', 6.0, 'positive'),
('mejor', 8.0, 'positive'),
('gracias', 6.0, 'positive'),
('muchas gracias', 7.0, 'positive'),
('me encanta', 9.0, 'positive'),
('me gusta', 7.0, 'positive'),
('amor', 8.0, 'positive'),
('amo', 9.0, 'positive'),
('brillante', 8.5, 'positive'),
('espectacular', 9.0, 'positive'),
('impresionante', 8.5, 'positive'),
('estupendo', 8.0, 'positive'),

-- Spanish Negative Keywords
('malo', -7.0, 'negative'),
('muy malo', -9.0, 'negative'),
('terrible', -9.0, 'negative'),
('horrible', -9.0, 'negative'),
('pésimo', -9.5, 'negative'),
('malísimo', -9.5, 'negative'),
('peor', -9.0, 'negative'),
('basura', -9.0, 'negative'),
('odio', -10.0, 'negative'),
('aburrido', -6.0, 'negative'),
('decepcionante', -7.0, 'negative'),
('decepcionado', -7.0, 'negative'),
('inútil', -8.0, 'negative'),
('ridículo', -7.5, 'negative'),
('tonto', -7.0, 'negative'),
('tontamente', -7.5, 'negative'),
('estúpido', -8.0, 'negative'),
('cansado', -6.0, 'negative'),
('cansados', -6.0, 'negative'),
('molesto', -6.5, 'negative'),
('molesta', -6.5, 'negative'),
('fastidioso', -7.0, 'negative'),
('desastre', -8.5, 'negative'),
('patético', -8.0, 'negative'),
('calidad baja', -7.0, 'negative'),
('baja calidad', -7.0, 'negative'),
('bajísima calidad', -9.0, 'negative'),
('mala calidad', -7.5, 'negative'),
('no me gusta', -7.0, 'negative'),
('no sirve', -7.5, 'negative'),
('porquería', -9.0, 'negative'),

-- Spanish Neutral Keywords
('bien', 0.0, 'neutral'),
('normal', 0.0, 'neutral'),
('regular', 0.0, 'neutral'),
('así así', 0.0, 'neutral'),
('más o menos', 0.0, 'neutral')

ON CONFLICT (keyword) DO NOTHING;

-- Add Portuguese keywords as well (common in Latin American content)
INSERT INTO sentiment_keywords (keyword, weight, category) VALUES
-- Portuguese Positive
('excelente', 8.5, 'positive'),
('incrível', 9.0, 'positive'),
('maravilhoso', 8.0, 'positive'),
('fantástico', 9.0, 'positive'),
('ótimo', 7.5, 'positive'),
('bom', 6.0, 'positive'),
('muito bom', 8.0, 'positive'),
('perfeito', 9.5, 'positive'),
('magnífico', 9.0, 'positive'),
('lindo', 7.5, 'positive'),
('bonito', 6.0, 'positive'),
('melhor', 8.0, 'positive'),
('obrigado', 6.0, 'positive'),
('adoro', 9.0, 'positive'),
('gosto', 7.0, 'positive'),
('amor', 8.0, 'positive'),
('amo', 9.0, 'positive'),

-- Portuguese Negative
('ruim', -7.0, 'negative'),
('péssimo', -9.5, 'negative'),
('terrível', -9.0, 'negative'),
('horrível', -9.0, 'negative'),
('pior', -9.0, 'negative'),
('lixo', -9.0, 'negative'),
('odeio', -10.0, 'negative'),
('chato', -6.0, 'negative'),
('decepcionante', -7.0, 'negative'),
('decepcionado', -7.0, 'negative'),
('inútil', -8.0, 'negative'),
('ridículo', -7.5, 'negative'),
('estúpido', -8.0, 'negative'),
('cansado', -6.0, 'negative'),
('cansativo', -6.5, 'negative'),

-- Portuguese Neutral
('normal', 0.0, 'neutral'),
('médio', 0.0, 'neutral'),
('regular', 0.0, 'neutral')

ON CONFLICT (keyword) DO NOTHING;
