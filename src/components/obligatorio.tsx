/**
 * La marca de campo obligatorio.
 *
 * Los formularios marcaban los campos opcionales con "(opcional)" y dejaban
 * los obligatorios sin marcar. Eso obliga a leer todas las etiquetas y
 * deducir por descarte, y falla justo cuando hay apuro: se llena lo que
 * parece importante, se aprieta guardar y el botón no responde.
 *
 * El asterisco es la convención que todo el mundo ya conoce. El `title` y el
 * texto escondido están para quien usa lector de pantalla, que no "ve" que
 * el asterisco es rojo.
 */
export function Obligatorio() {
  return (
    <span className="text-destructive" title="Obligatorio" aria-hidden={false}>
      <span aria-hidden>&nbsp;*</span>
      <span className="sr-only"> (obligatorio)</span>
    </span>
  );
}
