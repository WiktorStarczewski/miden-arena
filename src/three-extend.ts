/**
 * R3F v9 requires explicit registration of THREE objects used declaratively in JSX.
 * Import this file once at the app entry point before any Canvas renders.
 *
 * @see https://docs.pmnd.rs/react-three-fiber/api/objects#using-3rd-party-objects-declaratively
 */
import { extend } from "@react-three/fiber";
import {
  Mesh,
  Group,
  Points,
  AmbientLight,
  DirectionalLight,
  SpotLight,
  PointLight,
  Fog,
  Color,
  BoxGeometry,
  SphereGeometry,
  CylinderGeometry,
  PlaneGeometry,
  RingGeometry,
  CircleGeometry,
  MeshBasicMaterial,
  MeshToonMaterial,
} from "three";

extend({
  Mesh,
  Group,
  Points,
  AmbientLight,
  DirectionalLight,
  SpotLight,
  PointLight,
  Fog,
  Color,
  BoxGeometry,
  SphereGeometry,
  CylinderGeometry,
  PlaneGeometry,
  RingGeometry,
  CircleGeometry,
  MeshBasicMaterial,
  MeshToonMaterial,
});
