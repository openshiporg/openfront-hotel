'use client';
import { createContext,Suspense,useContext,useEffect,useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { stayHref,stayParameters } from '../lib/stay-context';
const EVENT='hotel-stay-change';
let memory='';
function snapshot(){try{return stayParameters(sessionStorage.getItem('hotel-stay-choices')||memory).toString();}catch{return memory;}}
function subscribe(callback:()=>void){window.addEventListener(EVENT,callback);window.addEventListener('storage',callback);return()=>{window.removeEventListener(EVENT,callback);window.removeEventListener('storage',callback);};}
function setStay(value:string){memory=stayParameters(value).toString();try{sessionStorage.setItem('hotel-stay-choices',memory);}catch{/* Dates still travel in links when storage is unavailable. */}window.dispatchEvent(new Event(EVENT));}
const Context=createContext({stay:'',setStay});
function ObserveStay(){const params=useSearchParams();useEffect(()=>{if(params?.has('checkIn')||params?.has('checkOut'))setStay(params.toString());},[params]);return null;}
export function StayProvider({children}:{children:React.ReactNode}){
 const stay=useSyncExternalStore(subscribe,snapshot,()=> '');
 useEffect(()=>{try{localStorage.removeItem('openfront_guest_context');}catch{/* Legacy storage cleanup is optional. */}},[]);
 return <Context.Provider value={{stay,setStay}}><Suspense fallback={null}><ObserveStay/></Suspense>{children}</Context.Provider>;
}
export function useStay(){return useContext(Context);}
export function StayLink({href,children,...props}:Omit<React.ComponentProps<typeof Link>,'href'>&{href:string}){const {stay}=useStay();return <Link href={stayHref(href,stay)} {...props}>{children}</Link>;}
